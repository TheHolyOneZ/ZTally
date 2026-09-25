

mod browser;
mod browsers;
mod classify;
mod commands;
mod db;
mod focus;
mod i18n;
mod model;
mod report;
mod seed;
mod tracker;

use browser::Bridge;
use chrono::{Datelike, Duration as CDuration, Local, NaiveTime, TimeZone};
use classify::Classifier;
use db::Db;
use model::Settings;
use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WebviewWindowBuilder, Wry};
use tauri_plugin_notification::NotificationExt;
use tracker::{BackendInfo, Engine};

pub struct AppState {
    pub db: Arc<Mutex<Db>>,
    pub engine: Arc<Mutex<Engine>>,
    pub settings: Arc<Mutex<Settings>>,
    pub paused_until: Arc<Mutex<i64>>,
    pub backend: BackendInfo,
    pub bridge: Bridge,
    classifier: Mutex<Arc<Classifier>>,

    kinds: Mutex<HashMap<i64, String>>,
    notified: Mutex<HashSet<String>>,
    pub focus: Mutex<Option<focus::FocusSession>>,
    i18n: Mutex<Arc<i18n::I18n>>,
    pub db_path: String,
}

impl AppState {
    pub fn tr(&self) -> Arc<i18n::I18n> {
        self.i18n.lock().clone()
    }

    pub fn classifier(&self) -> Arc<Classifier> {
        self.classifier.lock().clone()
    }


    pub fn reload_rules(&self) {
        let rules = self.db.lock().rules().unwrap_or_default();
        *self.classifier.lock() = Arc::new(Classifier::new(rules));
        let cats = self.db.lock().categories().unwrap_or_default();
        *self.kinds.lock() = cats.into_iter().map(|c| (c.id, c.kind)).collect();
    }


    fn current_is_distracting(&self) -> Option<(bool, String)> {
        let cur = self.engine.lock().current.clone();
        if cur.state != "active" {
            return Some((false, String::new()));
        }
        let cat = self.classifier().classify(cur.app.as_deref()?, cur.domain.as_deref(), cur.title.as_deref().unwrap_or(""));
        let distracting = cat.and_then(|c| self.kinds.lock().get(&c).cloned()).as_deref() == Some("distracting");
        Some((distracting, cur.domain.or(cur.display).unwrap_or_default()))
    }
}

struct TrayItems {
    today: MenuItem<Wry>,
    open: MenuItem<Wry>,
    p15: MenuItem<Wry>,
    p60: MenuItem<Wry>,
    ptm: MenuItem<Wry>,
    resume: MenuItem<Wry>,
    focus_start: MenuItem<Wry>,
    focus_end: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}


pub fn apply_language(app: &AppHandle) {
    let state = app.state::<AppState>();
    let lang = state.settings.lock().language.clone();
    *state.i18n.lock() = Arc::new(i18n::I18n::new(&lang));
    let tr = state.tr();
    if let Some(items) = app.try_state::<TrayItems>() {
        let focus_minutes = state.settings.lock().focus_minutes;
        let _ = items.open.set_text(tr.t("tray.open", &[]));
        let _ = items.p15.set_text(tr.t("tray.pause15", &[]));
        let _ = items.p60.set_text(tr.t("tray.pause60", &[]));
        let _ = items.ptm.set_text(tr.t("tray.pauseTomorrow", &[]));
        let _ = items.resume.set_text(tr.t("tray.resume", &[]));
        let _ = items.focus_start.set_text(tr.t("tray.focusStart", &[("min", focus_minutes.to_string())]));
        let _ = items.focus_end.set_text(tr.t("tray.focusEnd", &[]));
        let _ = items.quit.set_text(tr.t("tray.quit", &[]));
    }
    refresh_tray(app);
}


fn local_midnight(date: chrono::NaiveDate) -> i64 {
    let naive = date.and_time(NaiveTime::MIN);
    Local
        .from_local_datetime(&naive)
        .earliest()
        .map(|d| d.timestamp_millis())

        .unwrap_or_else(|| Local.from_local_datetime(&(naive + CDuration::hours(1))).earliest().map_or(0, |d| d.timestamp_millis()))
}

pub fn today_bounds() -> (i64, i64) {
    let today = Local::now().date_naive();
    (local_midnight(today), local_midnight(today + CDuration::days(1)))
}

pub fn week_bounds(monday_first: bool) -> (i64, i64) {
    let today = Local::now().date_naive();
    let offset = if monday_first { today.weekday().num_days_from_monday() } else { today.weekday().num_days_from_sunday() };
    let start = today - CDuration::days(offset as i64);
    (local_midnight(start), local_midnight(start + CDuration::days(7)))
}

pub fn fmt_duration(ms: i64) -> String {
    let m = ms / 60_000;
    if m < 60 {
        format!("{m}m")
    } else {
        format!("{}h {:02}m", m / 60, m % 60)
    }
}


pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let Some(conf) = app.config().app.windows.iter().find(|w| w.label == "main").cloned() else { return };
    match WebviewWindowBuilder::from_config(app, &conf).and_then(|b| b.build()) {
        Ok(w) => {
            let _ = w.set_focus();
        }
        Err(e) => eprintln!("[ztally] cannot open window: {e}"),
    }
}

fn set_pause(app: &AppHandle, until: i64) {
    let state = app.state::<AppState>();
    *state.paused_until.lock() = until;
    let _ = state.db.lock().set_kv("paused_until", &until.to_string());
    refresh_tray(app);
}

pub fn pause_until(app: &AppHandle, until: i64) {
    set_pause(app, until);
}

fn refresh_tray(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (s, e) = today_bounds();
    state.engine.lock().flush();
    let rows = state.db.lock().spans_in(s, e).unwrap_or_default();
    let active: i64 = rows.iter().filter(|r| !r.afk).map(|r| r.end - r.start).sum();
    let paused_until = *state.paused_until.lock();
    let now = Local::now().timestamp_millis();
    let paused = paused_until > now;

    let focus = state.focus.lock().clone();
    let tr = state.tr();
    let text = if let Some(f) = &focus {
        tr.t("tray.focus", &[("left", fmt_duration((f.end - now).max(0) + 59_999)), ("total", fmt_duration(active))])
    } else if paused {
        let until = Local.timestamp_millis_opt(paused_until).single().map(|d| d.format("%H:%M").to_string()).unwrap_or_default();
        tr.t("tray.paused", &[("time", until), ("total", fmt_duration(active))])
    } else {
        tr.t("tray.today", &[("time", fmt_duration(active))])
    };
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.today.set_text(&text);
        let _ = items.resume.set_enabled(paused);
        let _ = items.focus_start.set_enabled(focus.is_none());
        let _ = items.focus_end.set_enabled(focus.is_some());
    }
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("ZTally: {text}")));
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {

    let item = |id: &str, enabled: bool| MenuItem::with_id(app, id, id, enabled, None::<&str>);
    let today = item("today", false)?;
    let open = item("open", true)?;
    let p15 = item("pause15", true)?;
    let p60 = item("pause60", true)?;
    let ptm = item("pause_tomorrow", true)?;
    let resume = item("resume", false)?;
    let focus_start = item("focus_start", true)?;
    let focus_end = item("focus_end", false)?;
    let quit = item("quit", true)?;
    let sep = || PredefinedMenuItem::separator(app);
    let menu = Menu::with_items(app, &[&today, &sep()?, &open, &sep()?, &focus_start, &focus_end, &sep()?, &p15, &p60, &ptm, &resume, &sep()?, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().ok_or(tauri::Error::InvalidIcon(std::io::Error::other("no icon")))?)
        .tooltip("ZTally")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| {
            let now = Local::now().timestamp_millis();
            match ev.id().as_ref() {
                "open" => show_main(app),
                "pause15" => set_pause(app, now + 15 * 60_000),
                "pause60" => set_pause(app, now + 60 * 60_000),
                "pause_tomorrow" => set_pause(app, today_bounds().1),
                "resume" => set_pause(app, 0),
                "focus_start" => {
                    let m = app.state::<AppState>().settings.lock().focus_minutes;
                    start_focus(app, m);
                }
                "focus_end" => end_focus(app, false),
                "quit" => {
                    end_focus(app, false);
                    app.state::<AppState>().engine.lock().shutdown();
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    app.manage(TrayItems { today, open, p15, p60, ptm, resume, focus_start, focus_end, quit });
    apply_language(app);
    Ok(())
}


pub fn start_focus(app: &AppHandle, minutes: i64) {
    let now = Local::now().timestamp_millis();
    let state = app.state::<AppState>();
    if state.focus.lock().is_some() {
        end_focus(app, false);
    }
    *state.focus.lock() = Some(focus::FocusSession::new(now, minutes));
    refresh_tray(app);
}


pub fn end_focus(app: &AppHandle, completed: bool) {
    let state = app.state::<AppState>();
    let Some(f) = state.focus.lock().take() else { return };
    let now = Local::now().timestamp_millis();
    let end = if completed { f.end } else { now.min(f.end) };

    if end - f.start >= 60_000 {
        let _ = state.db.lock().insert_focus(&db::FocusRecord { start: f.start, end, planned_ms: f.planned_ms, drift_ms: f.drift_ms, completed });
    }
    if completed && state.settings.lock().notifications {
        let on_task = 100 - (f.drift_ms * 100 / f.planned_ms.max(1));
        let tr = state.tr();
        let _ = app
            .notification()
            .builder()
            .title(tr.t("notify.focusDone.title", &[]))
            .body(tr.t("notify.focusDone.body", &[("time", fmt_duration(f.planned_ms)), ("pct", on_task.clamp(0, 100).to_string())]))
            .show();
    }
    refresh_tray(app);
}

fn focus_tick(app: &AppHandle, now: i64) {
    let state = app.state::<AppState>();
    if state.focus.lock().is_none() {
        return;
    }
    let (distracting, what) = state.current_is_distracting().unwrap_or((false, String::new()));
    let event = state.focus.lock().as_mut().and_then(|f| f.tick(now, distracting).map(|e| (e, f.end)));
    match event {
        Some((focus::FocusEvent::Done, _)) => end_focus(app, true),
        Some((focus::FocusEvent::Drift { run_ms }, end)) if state.settings.lock().notifications => {
            let tr = state.tr();
            let _ = app
                .notification()
                .builder()
                .title(tr.t("notify.drift.title", &[]))
                .body(tr.t(
                    "notify.drift.body",
                    &[("time", fmt_duration(run_ms)), ("what", what), ("left", fmt_duration((end - now).max(0)))],
                ))
                .show();
        }
        _ => {}
    }
}


fn check_goals(app: &AppHandle) {
    let state = app.state::<AppState>();
    let settings = state.settings.lock().clone();
    if !settings.notifications {
        return;
    }
    let goals = state.db.lock().goals().unwrap_or_default();
    let cats = state.db.lock().categories().unwrap_or_default();
    let classifier = state.classifier();
    let ctx = report::Ctx::new(&classifier, &cats);
    let day = today_bounds();
    let week = week_bounds(settings.week_starts_monday);
    let day_rows = state.db.lock().spans_in(day.0, day.1).unwrap_or_default();
    let week_rows = if goals.iter().any(|g| g.period == "week") { state.db.lock().spans_in(week.0, week.1).unwrap_or_default() } else { vec![] };

    let tr = state.tr();
    let target_name = |g: &db::Goal| -> String {
        match g.target_kind.as_str() {
            "total" => tr.t("notify.screenTime", &[]),
            "category" => cats.iter().find(|c| c.id.to_string() == g.target).map(|c| tr.category(&c.name)).unwrap_or_default(),
            _ => g.target.clone(),
        }
    };

    for g in &goals {
        let (rows, period_start, period_word) = if g.period == "week" { (&week_rows, week.0, tr.t("notify.periodWeek", &[])) } else { (&day_rows, day.0, tr.t("notify.periodToday", &[])) };
        let p = report::goal_progress(&ctx, g, rows);
        let name = target_name(g);
        let limit = fmt_duration(g.minutes * 60_000);
        let vars = [("name", name.clone()), ("used", fmt_duration(p.used_ms)), ("limit", limit.clone()), ("period", period_word.clone())];
        let msg = |k: &str| (tr.t(&format!("notify.{k}.title"), &vars), tr.t(&format!("notify.{k}.body"), &vars));
        let note = match g.op.as_str() {
            "max" if p.ratio >= 1.0 => Some(("over", msg("goalOver"))),
            "max" if p.ratio >= 0.8 => Some(("near", msg("goalNear"))),
            "min" if p.ratio >= 1.0 => Some(("done", msg("goalDone"))),
            _ => None,
        };
        if let Some((level, (title, body))) = note {
            let key = format!("{}:{}:{}", g.id, period_start, level);
            if state.notified.lock().insert(key) {
                let _ = app.notification().builder().title(title).body(body).show();
            }
        }
    }


    if settings.weekly_report_notice && Local::now().timestamp_millis() - week.0 > 9 * 3_600_000 {
        let key = week.0.to_string();
        let db = state.db.lock();
        if db.first_span_start().ok().flatten().is_some_and(|f| f < week.0) && db.kv("weekly_notice").as_deref() != Some(&key) {
            let _ = db.set_kv("weekly_notice", &key);
            drop(db);
            let _ = app
                .notification()
                .builder()
                .title(tr.t("notify.weekly.title", &[]))
                .body(tr.t("notify.weekly.body", &[]))
                .show();
        }
    }
}


pub fn data_dir() -> std::path::PathBuf {
    if let Ok(d) = std::env::var("ZTALLY_DATA_DIR") {
        return d.into();
    }
    dirs::data_local_dir().unwrap_or_else(std::env::temp_dir).join("ztally")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = data_dir().join("ztally.db");
    let db = match Db::open(&db_path) {
        Ok(db) => db,
        Err(e) => {
            eprintln!("[ztally] cannot open database {}: {e}", db_path.display());
            std::process::exit(1);
        }
    };
    let settings = db.settings();
    let paused: i64 = db.kv("paused_until").and_then(|v| v.parse().ok()).unwrap_or(0);
    let rules = db.rules().unwrap_or_default();
    let categories = db.categories().unwrap_or_default();
    let db = Arc::new(Mutex::new(db));
    let bridge = Bridge::default();
    let backend = tracker::detect();
    eprintln!("[ztally] backend: {} (ok: {}){}", backend.info.label, backend.info.ok, backend.info.note.as_deref().map(|n| format!(" - {n}")).unwrap_or_default());

    let state = AppState {
        db: db.clone(),
        engine: Arc::new(Mutex::new(Engine::new(db.clone(), bridge.clone()))),
        settings: Arc::new(Mutex::new(settings.clone())),
        paused_until: Arc::new(Mutex::new(paused)),
        backend: backend.info.clone(),
        bridge: bridge.clone(),
        classifier: Mutex::new(Arc::new(Classifier::new(rules))),
        i18n: Mutex::new(Arc::new(i18n::I18n::new(&settings.language))),
        kinds: Mutex::new(categories.into_iter().map(|c| (c.id, c.kind)).collect()),
        notified: Default::default(),
        focus: Mutex::new(None),
        db_path: db_path.to_string_lossy().into_owned(),
    };
    let start_hidden = std::env::args().any(|a| a == "--hidden");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(commands::handler())
        .setup(move |app| {
            let handle = app.handle().clone();
            browser::spawn_bridge(bridge.clone(), settings.bridge_port);
            if let Err(e) = build_tray(&handle) {
                eprintln!("[ztally] tray unavailable: {e}");
            }
            let st = handle.state::<AppState>();
            let (engine, settings, paused) = (st.engine.clone(), st.settings.clone(), st.paused_until.clone());
            let h2 = handle.clone();
            std::thread::Builder::new().name("ztally-tracker".into()).spawn(move || {
                tracker::run(backend, tracker::audio_source(), engine, settings, paused, move |now, minute| {
                    focus_tick(&h2, now);
                    if minute {
                        refresh_tray(&h2);
                        check_goals(&h2);
                    }
                });
            })?;

            if !start_hidden || !st.settings.lock().onboarded {
                show_main(&handle);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building ZTally");

    app.run(|app, event| match event {

        RunEvent::ExitRequested { api, code: None, .. } => api.prevent_exit(),
        RunEvent::Exit => {
            end_focus(app, false);
            app.state::<AppState>().engine.lock().shutdown();
        }
        _ => {}
    });
}
