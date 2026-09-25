

use crate::classify::Rule;
use crate::db::{AppEntry, Category, Goal};
use crate::model::Settings;
use crate::report::{self, Ctx, DayView, GoalProgress, RangeView};
use crate::tracker::{BackendInfo, Current};
use crate::AppState;
use serde::Serialize;
use tauri::{AppHandle, State};

type R<T> = Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    backend: BackendInfo,
    current: Current,
    paused_until: i64,
    extension_connected: bool,
    extension_browser: Option<String>,
    db_path: String,
    first_day: Option<i64>,
    version: &'static str,
    platform: &'static str,
    focus: Option<crate::focus::FocusSession>,

    today_ms: i64,
}

#[tauri::command]
fn status(st: State<AppState>) -> R<Status> {


    let current = st.engine.lock().current.clone();
    st.engine.lock().flush();
    let first_day = st.db.lock().first_span_start()?;
    let (s, e) = crate::today_bounds();
    let today_ms = st.db.lock().spans_in(s, e)?.iter().filter(|r| !r.afk).map(|r| r.end - r.start).sum();
    let paused_until = *st.paused_until.lock();
    let focus = st.focus.lock().clone();
    Ok(Status {
        backend: st.backend.clone(),
        current,
        paused_until,
        extension_connected: st.bridge.connected(),
        extension_browser: st.bridge.connected_browser(),
        db_path: st.db_path.clone(),
        first_day,
        version: env!("CARGO_PKG_VERSION"),
        platform: if cfg!(windows) { "windows" } else { "linux" },
        focus,
        today_ms,
    })
}

#[tauri::command]
fn day(st: State<AppState>, start: i64, end: i64) -> R<DayView> {
    st.engine.lock().flush();
    let rows = st.db.lock().spans_in(start, end)?;
    let audio = st.db.lock().audio_in(start, end)?;
    let calls = st.db.lock().calls_in(start, end)?;
    let cats = st.db.lock().categories()?;
    let c = st.classifier();
    Ok(report::day_view(&Ctx::new(&c, &cats), &rows, &audio, &calls, start, end))
}


fn runs(days: &[(i64, i64)]) -> Vec<(i64, i64)> {
    let mut sorted = days.to_vec();
    sorted.sort();
    let mut out: Vec<(i64, i64)> = vec![];
    for (s, e) in sorted {
        match out.last_mut() {
            Some(last) if s <= last.1 => last.1 = last.1.max(e),
            _ => out.push((s, e)),
        }
    }
    out
}

type Rows = (Vec<crate::db::SpanRow>, Vec<crate::db::SpanRow>, Vec<crate::db::SpanRow>);

fn rows_for(st: &AppState, days: &[(i64, i64)]) -> R<Rows> {
    st.engine.lock().flush();
    let (mut rows, mut audio, mut calls) = (vec![], vec![], vec![]);
    for (s, e) in runs(days) {
        rows.extend(st.db.lock().spans_in(s, e)?);
        audio.extend(st.db.lock().audio_in(s, e)?);
        calls.extend(st.db.lock().calls_in(s, e)?);
    }
    Ok((rows, audio, calls))
}

#[tauri::command]
fn range(st: State<AppState>, days: Vec<(i64, i64)>) -> R<RangeView> {
    if days.is_empty() {
        return Err("empty range".into());
    }
    let mut days = days;
    days.sort();
    let (rows, audio, calls) = rows_for(&st, &days)?;
    let cats = st.db.lock().categories()?;
    let c = st.classifier();
    Ok(report::range_view(&Ctx::new(&c, &cats), &rows, &audio, &calls, &days))
}


#[tauri::command]
fn categories(st: State<AppState>) -> R<Vec<Category>> {
    st.db.lock().categories()
}

#[tauri::command]
fn save_category(st: State<AppState>, category: Category) -> R<i64> {
    if category.name.trim().is_empty() {
        return Err("Name can't be empty".into());
    }
    if !matches!(category.kind.as_str(), "productive" | "neutral" | "distracting") {
        return Err("Invalid kind".into());
    }
    let id = st.db.lock().upsert_category(&Category { slot: category.slot.clamp(1, 8), ..category })?;
    st.reload_rules();
    Ok(id)
}

#[tauri::command]
fn delete_category(st: State<AppState>, id: i64) -> R<()> {
    st.db.lock().delete_category(id)?;
    st.reload_rules();
    Ok(())
}

#[tauri::command]
fn rules(st: State<AppState>) -> R<Vec<Rule>> {
    st.db.lock().rules()
}

#[tauri::command]
fn add_rule(st: State<AppState>, match_type: String, pattern: String, category_id: i64) -> R<i64> {
    if !matches!(match_type.as_str(), "app" | "domain" | "title") {
        return Err("Invalid rule type".into());
    }
    if pattern.trim().is_empty() {
        return Err("Pattern can't be empty".into());
    }

    let id = st.db.lock().add_rule(&match_type, &pattern, category_id)?;
    st.reload_rules();
    Ok(id)
}

#[tauri::command]
fn delete_rule(st: State<AppState>, id: i64) -> R<()> {
    st.db.lock().delete_rule(id)?;
    st.reload_rules();
    Ok(())
}

#[tauri::command]
fn reset_rules(st: State<AppState>) -> R<()> {
    st.db.lock().reset_rules_to_defaults(false)?;
    st.reload_rules();
    Ok(())
}


#[tauri::command]
fn goals(st: State<AppState>) -> R<Vec<Goal>> {
    st.db.lock().goals()
}

#[tauri::command]
fn save_goal(st: State<AppState>, goal: Goal) -> R<i64> {
    if goal.minutes <= 0 {
        return Err("Minutes must be positive".into());
    }
    st.db.lock().upsert_goal(&goal)
}

#[tauri::command]
fn delete_goal(st: State<AppState>, id: i64) -> R<()> {
    st.db.lock().delete_goal(id)
}

#[tauri::command]
fn goal_progress(st: State<AppState>, day: (i64, i64), week: (i64, i64)) -> R<Vec<GoalProgress>> {
    st.engine.lock().flush();
    let goals = st.db.lock().goals()?;
    let cats = st.db.lock().categories()?;
    let c = st.classifier();
    let ctx = Ctx::new(&c, &cats);
    let day_rows = st.db.lock().spans_in(day.0, day.1)?;
    let week_rows = st.db.lock().spans_in(week.0, week.1)?;
    Ok(goals.iter().map(|g| report::goal_progress(&ctx, g, if g.period == "week" { &week_rows } else { &day_rows })).collect())
}


#[tauri::command]
fn settings(st: State<AppState>) -> Settings {
    st.settings.lock().clone()
}

#[tauri::command]
fn save_settings(app: AppHandle, st: State<AppState>, settings: Settings) -> R<()> {
    let settings = Settings { idle_threshold_s: settings.idle_threshold_s.clamp(30, 3600), ..settings };
    st.db.lock().save_settings(&settings)?;
    let relabel = {
        let old = st.settings.lock();
        old.language != settings.language || old.focus_minutes != settings.focus_minutes
    };
    *st.settings.lock() = settings;
    if relabel {
        crate::apply_language(&app);
    }
    Ok(())
}

#[tauri::command]
fn pause(app: AppHandle, until: i64) {
    crate::pause_until(&app, until);
}

#[tauri::command]
fn focus_start(app: AppHandle, minutes: i64) {
    crate::start_focus(&app, minutes);
}

#[tauri::command]
fn focus_stop(app: AppHandle) {
    crate::end_focus(&app, false);
}

#[tauri::command]
fn focus_history(st: State<AppState>, start: i64, end: i64) -> R<Vec<crate::db::FocusRecord>> {
    st.db.lock().focus_in(start, end)
}

#[tauri::command]
fn apps(st: State<AppState>) -> R<Vec<AppEntry>> {
    st.engine.lock().flush();
    st.db.lock().apps()
}

#[tauri::command]
fn domains(st: State<AppState>) -> R<Vec<(String, i64)>> {
    st.db.lock().domains()
}

#[tauri::command]
fn rename_app(st: State<AppState>, key: String, display: String) -> R<()> {
    st.db.lock().rename_app(&key, display.trim())
}

#[tauri::command]
fn forget(st: State<AppState>, start: i64, end: i64, app_key: Option<String>) -> R<usize> {
    st.engine.lock().shutdown();
    st.db.lock().delete_spans(start, end, app_key.as_deref())
}


#[tauri::command]
fn forget_days(st: State<AppState>, days: Vec<(i64, i64)>) -> R<usize> {
    st.engine.lock().shutdown();
    let mut n = 0;
    for (s, e) in runs(&days) {
        n += st.db.lock().delete_spans(s, e, None)?;
    }
    Ok(n)
}


#[tauri::command]
fn reset_all(app: AppHandle, st: State<AppState>) -> R<()> {
    *st.focus.lock() = None;
    st.engine.lock().forget_cache();
    st.db.lock().wipe()?;
    *st.settings.lock() = st.db.lock().settings();
    *st.paused_until.lock() = 0;
    st.reload_rules();
    crate::apply_language(&app);
    Ok(())
}

#[tauri::command]
fn export(st: State<AppState>, days: Vec<(i64, i64)>, format: String, path: String) -> R<usize> {
    let (rows, audio, calls) = rows_for(&st, &days)?;
    let cats = st.db.lock().categories()?;
    let c = st.classifier();
    let out = report::export(&Ctx::new(&c, &cats), &rows, &audio, &calls, &cats, &format);
    std::fs::write(&path, out).map_err(|e| e.to_string())?;
    Ok(rows.len() + audio.len() + calls.len())
}

#[tauri::command]
fn save_bytes(path: String, data: Vec<u8>) -> R<()> {
    std::fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn install_gnome_extension() -> R<String> {
    #[cfg(target_os = "linux")]
    {
        crate::tracker::install_gnome_extension()
    }
    #[cfg(not(target_os = "linux"))]
    {
        Err("Only available on Linux".into())
    }
}

const EXT_FILES: &[(&str, &str)] = &[
    ("manifest.json", include_str!("../../extension/manifest.json")),
    ("background.js", include_str!("../../extension/background.js")),
    ("README.txt", include_str!("../../extension/README.txt")),
];
const EXT_ICON: &[u8] = include_bytes!("../../extension/icon-128.png");


#[tauri::command]
fn open_browser_extension() -> R<String> {
    let dir = prepare_extension()?;
    let _ = tauri_plugin_opener::open_path(&dir, None::<&str>);
    Ok(dir)
}


#[tauri::command]
fn prepare_extension() -> R<String> {
    let dir = crate::data_dir().join("browser-extension");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for (name, body) in EXT_FILES {
        std::fs::write(dir.join(name), body).map_err(|e| e.to_string())?;
    }
    std::fs::write(dir.join("icon-128.png"), EXT_ICON).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn detect_browsers() -> Vec<crate::browsers::BrowserInfo> {
    crate::browsers::detect()
}

#[tauri::command]
fn open_extension_page(id: String) -> R<bool> {
    crate::browsers::open_extension_page(&id)
}


#[tauri::command]
fn open_link(target: String) -> R<()> {
    let url = match target.as_str() {
        "website" => "https://zsync.eu/ztally/",
        "source" => "https://github.com/TheHolyOneZ/ZTally",
        "author" => "https://github.com/TheHolyOneZ",
        "projects" => "https://zsync.eu/",
        "mods" => "https://zlogic.eu/",
        _ => return Err("unknown link".into()),
    };
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_data_folder() -> R<()> {
    tauri_plugin_opener::open_path(crate::data_dir(), None::<&str>).map_err(|e| e.to_string())
}

pub fn handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        status,
        day,
        range,
        categories,
        save_category,
        delete_category,
        rules,
        add_rule,
        delete_rule,
        reset_rules,
        goals,
        save_goal,
        delete_goal,
        goal_progress,
        settings,
        save_settings,
        pause,
        focus_start,
        focus_stop,
        focus_history,
        apps,
        domains,
        rename_app,
        forget,
        forget_days,
        reset_all,
        export,
        save_bytes,
        install_gnome_extension,
        open_browser_extension,
        open_data_folder,
        open_link,
        prepare_extension,
        detect_browsers,
        open_extension_page,
    ]
}

#[cfg(test)]
mod tests {
    #[test]
    fn runs_merge_touching_days_only() {
        assert_eq!(super::runs(&[(20, 30), (0, 10), (10, 20), (50, 60)]), vec![(0, 30), (50, 60)]);
        assert_eq!(super::runs(&[]), vec![]);
    }
}
