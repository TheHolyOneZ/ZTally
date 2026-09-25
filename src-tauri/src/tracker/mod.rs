

use crate::browser::{self, Bridge};
use crate::db::Db;
use crate::model::{RawWindow, Settings, WindowInfo};
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

#[cfg(target_os = "linux")]
mod gnome;
#[cfg(target_os = "linux")]
mod hyprland;
#[cfg(target_os = "linux")]
mod kwin;
#[cfg(target_os = "linux")]
mod mpris;
#[cfg(target_os = "linux")]
mod pulse;
#[cfg(target_os = "linux")]
mod sway;
#[cfg(target_os = "linux")]
mod x11;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "linux")]
pub use gnome::install_extension as install_gnome_extension;

pub trait ActiveWindowSource: Send {
    fn sample(&mut self) -> Option<RawWindow>;
}

pub trait IdleSource: Send {

    fn idle_ms(&mut self) -> Option<u64>;
}


#[derive(Clone, Debug, PartialEq)]
pub struct Playing {

    pub app: String,
    pub display: Option<String>,

    pub title: String,
    pub url: Option<String>,


    pub tab_active: bool,
}

pub trait AudioSource: Send {

    fn playing(&mut self) -> Vec<Playing>;

    fn mics(&mut self) -> Vec<String> {
        vec![]
    }
}

impl AudioSource for Nothing {
    fn playing(&mut self) -> Vec<Playing> {
        vec![]
    }
}


pub fn merge_audio(sessions: Vec<(Playing, bool)>, streams: Vec<Playing>) -> Vec<Playing> {
    let known: Vec<String> = sessions.iter().map(|(p, _)| audio_app_key(&p.app)).collect();
    let mut out: Vec<Playing> = sessions.into_iter().filter(|(_, on)| *on).map(|(p, _)| p).collect();
    for s in streams {
        let key = audio_app_key(&s.app);
        let covered = out.iter().any(|p| audio_app_key(&p.app) == key);
        let paused_player = known.contains(&key) && !browser::is_browser(&key);
        if !covered && !paused_player {
            out.push(s);
        }
    }
    out
}

#[cfg(target_os = "linux")]
struct LinuxAudio {
    mpris: mpris::Mpris,
    pulse: pulse::Pulse,
}

#[cfg(target_os = "linux")]
impl AudioSource for LinuxAudio {
    fn playing(&mut self) -> Vec<Playing> {
        merge_audio(self.mpris.players(), self.pulse.playing())
    }

    fn mics(&mut self) -> Vec<String> {
        self.pulse.mics()
    }
}

pub fn audio_source() -> Box<dyn AudioSource> {
    #[cfg(target_os = "linux")]
    return Box::new(LinuxAudio { mpris: mpris::Mpris::new(), pulse: pulse::Pulse::new() });
    #[cfg(windows)]
    return Box::new(windows::MediaSessions::default());
    #[allow(unreachable_code)]
    Box::new(Nothing)
}


pub fn audio_app_key(app: &str) -> String {
    let a = app.trim().to_lowercase();


    let a = match a.as_str() {
        "308046b0af4a39cb" | "firefox.exe" => "firefox".to_string(),
        _ if a.contains('!') => {
            let pkg = a.split('!').next().unwrap_or(&a);
            let pkg = pkg.split('_').next().unwrap_or(pkg);
            pkg.rsplit('.').next().unwrap_or(pkg).to_string()
        }
        _ => a,
    };
    crate::model::normalize_exe(&crate::model::normalize_class(&a))
}


pub struct Nothing;
impl ActiveWindowSource for Nothing {
    fn sample(&mut self) -> Option<RawWindow> {
        None
    }
}
impl IdleSource for Nothing {
    fn idle_ms(&mut self) -> Option<u64> {
        None
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackendInfo {
    pub id: &'static str,
    pub label: String,
    pub ok: bool,
    pub idle_supported: bool,
    pub note: Option<String>,

    pub fix: Option<&'static str>,
}

pub struct Backend {
    pub window: Box<dyn ActiveWindowSource>,
    pub idle: Box<dyn IdleSource>,
    pub info: BackendInfo,
}

impl Backend {
    #[cfg_attr(windows, allow(dead_code))]
    pub fn none(label: &str, note: &str) -> Self {
        Backend {
            window: Box::new(Nothing),
            idle: Box::new(Nothing),
            info: BackendInfo {
                id: "none",
                label: label.into(),
                ok: false,
                idle_supported: false,
                note: Some(note.into()),
                fix: None,
            },
        }
    }
}


#[cfg(target_os = "linux")]
pub fn detect() -> Backend {
    let env = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
    let forced = env("ZTALLY_BACKEND");
    let desktop = env("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase();
    let wayland = env("XDG_SESSION_TYPE").as_deref() == Some("wayland") || (env("WAYLAND_DISPLAY").is_some() && env("DISPLAY").is_none());

    let choice = forced.unwrap_or_else(|| {
        if env("HYPRLAND_INSTANCE_SIGNATURE").is_some() {
            "hyprland".into()
        } else if env("SWAYSOCK").is_some() {
            "sway".into()
        } else if wayland && desktop.contains("kde") {
            "kwin".into()
        } else if wayland && desktop.contains("gnome") {
            "gnome".into()
        } else if wayland {
            "wayland-unknown".into()
        } else {
            "x11".into()
        }
    });

    match choice.as_str() {
        "x11" => x11::backend(),
        "kwin" => kwin::backend(),
        "gnome" => gnome::backend(),
        "sway" => sway::backend(),
        "hyprland" => hyprland::backend(),
        _ => Backend::none(
            "Wayland (unsupported compositor)",
            "This compositor does not expose the focused window. KDE Plasma, GNOME, Sway, Hyprland and X11 sessions are supported.",
        ),
    }
}

#[cfg(windows)]
pub fn detect() -> Backend {
    windows::backend()
}

#[cfg(not(any(target_os = "linux", windows)))]
pub fn detect() -> Backend {
    Backend::none("Unsupported OS", "ZTally supports Linux and Windows.")
}


#[cfg(target_os = "linux")]
pub fn exe_of_pid(pid: u32) -> Option<String> {
    if pid == 0 {
        return None;
    }
    std::fs::read_link(format!("/proc/{pid}/exe")).ok().map(|p| {
        let s = p.to_string_lossy().to_string();
        s.strip_suffix(" (deleted)").map(str::to_string).unwrap_or(s)
    })
}


#[cfg(target_os = "linux")]
pub fn exe_for(pid: Option<u32>, class: Option<&str>) -> Option<String> {
    let exe = exe_of_pid(pid?)?;
    let Some(class) = class.map(crate::model::normalize_class).filter(|c| !c.is_empty()) else {
        return Some(exe);
    };
    let stem = crate::model::normalize_exe(&exe);
    let squash = |s: &str| s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>();
    let (a, b) = (squash(&stem), squash(&class));
    let related = a.contains(&b)
        || b.contains(&a)
        || (a.len() >= 4 && b.len() >= 4 && a[..4] == b[..4])
        || std::fs::read(format!("/proc/{}/cmdline", pid?))
            .map(|c| squash(&String::from_utf8_lossy(&c).to_lowercase()).contains(&b))
            .unwrap_or(false);

    (related || crate::model::is_generic_host(&stem)).then_some(exe)
}


#[cfg(target_os = "linux")]
pub struct LogindIdle {
    conn: Option<zbus::blocking::Connection>,
}

#[cfg(target_os = "linux")]
impl LogindIdle {
    pub fn new() -> Self {
        Self { conn: zbus::blocking::Connection::system().ok() }
    }
}

#[cfg(target_os = "linux")]
impl IdleSource for LogindIdle {
    fn idle_ms(&mut self) -> Option<u64> {
        let conn = self.conn.as_ref()?;
        let p = zbus::blocking::Proxy::new(
            conn,
            "org.freedesktop.login1",
            "/org/freedesktop/login1/session/auto",
            "org.freedesktop.login1.Session",
        )
        .ok()?;
        let idle: bool = p.get_property("IdleHint").ok()?;
        if !idle {
            return Some(0);
        }
        let since_us: u64 = p.get_property("IdleSinceHint").ok()?;
        let now_us = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).ok()?.as_micros() as u64;
        Some(now_us.saturating_sub(since_us) / 1000)
    }
}


#[derive(Clone, Debug, PartialEq, Eq)]
struct SpanKey {
    app_key: String,
    title: String,
    domain: Option<String>,
    afk: bool,
}

#[derive(Debug)]
struct OpenSpan {
    id: i64,
    key: SpanKey,
    start: i64,
    end: i64,
    flushed_end: i64,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Current {

    pub state: String,
    pub app: Option<String>,
    pub display: Option<String>,
    pub title: Option<String>,
    pub domain: Option<String>,
    pub since: i64,
    pub idle_ms: u64,
}

pub struct Observation {
    pub now: i64,
    pub window: Option<RawWindow>,
    pub idle_ms: Option<u64>,
    pub paused: bool,
}


pub struct Engine {
    db: Arc<Mutex<Db>>,
    bridge: Bridge,
    open: Option<OpenSpan>,
    last_tick: Option<i64>,
    app_ids: HashMap<String, i64>,

    audio: HashMap<String, OpenAudio>,

    calls: HashMap<String, OpenAudio>,

    sounding: std::collections::HashSet<String>,

    ext_browser: Option<String>,
    pub current: Current,
}

#[derive(Debug)]
struct OpenAudio {
    id: i64,
    title: String,
    end: i64,
}


const AUDIO_ONLY: &[&str] = &[
    "spotify", "rhythmbox", "elisa", "amarok", "lollypop", "clementine", "strawberry", "audacious", "deadbeef", "cmus",
    "tidal-hifi", "deezer", "youtube-music", "g4music", "shortwave", "plexamp", "cider", "zunemusic", "music", "musicbee",
    "foobar2000", "winamp", "aimp", "quodlibet", "gnome-music", "tauon",
];


const AUDIO_GAP_MS: i64 = 15_000;


const SLEEP_GAP_MS: i64 = 15_000;
const FLUSH_EVERY_MS: i64 = 10_000;

impl Engine {
    pub fn new(db: Arc<Mutex<Db>>, bridge: Bridge) -> Self {
        Self { db, bridge, open: None, last_tick: None, app_ids: HashMap::new(), audio: HashMap::new(), calls: HashMap::new(), sounding: Default::default(), ext_browser: None, current: Current { state: "none".into(), ..Default::default() } }
    }

    fn app_id(&mut self, w: &WindowInfo) -> Option<i64> {
        if let Some(id) = self.app_ids.get(&w.app_key) {
            return Some(*id);
        }
        let id = self.db.lock().upsert_app(w).ok()?;
        self.app_ids.insert(w.app_key.clone(), id);
        Some(id)
    }

    fn close(&mut self, end: i64) {
        if let Some(mut s) = self.open.take() {
            s.end = end.max(s.start);
            let db = self.db.lock();
            if s.end - s.start < 1000 {

                let _ = db.delete_spans_by_id(s.id);
            } else if s.end != s.flushed_end {
                let _ = db.update_span_end(s.id, s.end);
            }
        }
    }


    pub fn flush(&mut self) {
        if let Some(s) = self.open.as_mut() {
            if s.end != s.flushed_end {
                let _ = self.db.lock().update_span_end(s.id, s.end);
                s.flushed_end = s.end;
            }
        }
    }


    pub fn forget_cache(&mut self) {
        self.shutdown();
        self.app_ids.clear();
        self.ext_browser = None;
    }

    pub fn shutdown(&mut self) {
        let end = self.open.as_ref().map(|s| s.end).unwrap_or(0);
        self.close(end);
        self.audio.clear();
        self.calls.clear();
    }


    pub fn call_tick(&mut self, now: i64, mics: Vec<String>, settings: &Settings, paused: bool) {
        let mut seen: Vec<String> = vec![];
        if settings.track_calls && !paused {
            for app in mics {
                let key = audio_app_key(&app);
                if key.is_empty() || seen.contains(&key) || settings.ignored_apps.contains(&key) {
                    continue;
                }
                self.sounding.insert(key.clone());
                seen.push(key.clone());
                if let Some(open) = self.calls.get_mut(&key) {
                    if now - open.end <= AUDIO_GAP_MS {
                        open.end = now;
                        let _ = self.db.lock().update_call_end(open.id, now);
                        continue;
                    }
                }
                let display = crate::seed::display_name(&key).map(str::to_string).unwrap_or_else(|| crate::model::prettify(&key));
                let info = WindowInfo { app_key: key.clone(), display, exe: None, class: None, title: String::new() };
                let Some(app_id) = self.app_id(&info) else { continue };
                if let Ok(id) = self.db.lock().insert_call(now, now, app_id) {
                    self.calls.insert(key, OpenAudio { id, title: String::new(), end: now });
                }
            }
        }
        self.calls.retain(|k, _| seen.contains(k));
    }


    fn expand_tabs(&self, playing: Vec<Playing>) -> Vec<(Playing, bool)> {
        let report = self.bridge.audible_tabs();
        let mut out = vec![];
        for p in playing {
            let key = audio_app_key(&p.app);
            let ours = match (&self.ext_browser, &report) {
                (Some(b), Some(_)) => *b == key,
                (None, Some((_, family))) => browser::is_browser(&key) && (family == "firefox") == browser::is_firefox_family(&key),
                _ => false,
            };
            match (&report, ours) {
                (Some((tabs, _)), true) => {

                    for t in tabs {
                        let url = (!t.incognito && !t.url.is_empty()).then(|| t.url.clone());
                        out.push((Playing { app: p.app.clone(), display: p.display.clone(), title: t.title.clone(), url, tab_active: t.active }, true));
                    }
                }
                _ => out.push((p, false)),
            }
        }
        out
    }


    pub fn audio_tick(&mut self, now: i64, playing: Vec<Playing>, settings: &Settings, paused: bool) {
        let mut seen: Vec<String> = vec![];
        let playing = self.expand_tabs(playing);

        self.sounding = playing.iter().map(|(p, _)| audio_app_key(&p.app)).collect();
        if settings.track_background_audio && !paused {
            let foreground = (self.current.state == "active").then(|| self.current.app.clone()).flatten();
            for (p, is_tab) in playing {
                let key = audio_app_key(&p.app);
                let in_front = foreground.as_deref() == Some(key.as_str());

                if key.is_empty() || (in_front && (!is_tab || p.tab_active)) {
                    continue;
                }
                if settings.ignored_apps.contains(&key) || (key == "ztally" && !settings.track_self) {
                    continue;
                }
                let domain = p.url.as_deref().and_then(browser::domain_from_url).filter(|d| d != "local file");
                let slot = format!("{key}|{}", domain.as_deref().unwrap_or(""));
                if seen.contains(&slot) {
                    continue;
                }
                seen.push(slot.clone());
                let hide = !settings.record_titles || settings.title_exclusions.contains(&key);
                let title: String = if hide { String::new() } else { p.title.chars().take(300).collect() };
                if let Some(open) = self.audio.get_mut(&slot) {
                    if open.title == title && now - open.end <= AUDIO_GAP_MS {
                        open.end = now;
                        let _ = self.db.lock().update_audio_end(open.id, now);
                        continue;
                    }
                }
                let display = crate::seed::display_name(&key)
                    .map(str::to_string)
                    .or(p.display.clone())
                    .unwrap_or_else(|| key.clone());
                let info = WindowInfo { app_key: key.clone(), display, exe: None, class: None, title: String::new() };
                let Some(app_id) = self.app_id(&info) else { continue };

                let start = self.audio.get(&slot).filter(|o| now - o.end <= AUDIO_GAP_MS).map_or(now, |o| o.end);
                if let Ok(id) = self.db.lock().insert_audio(start, now, app_id, &title, domain.as_deref()) {
                    self.audio.insert(slot, OpenAudio { id, title, end: now });
                }
            }
        }
        self.audio.retain(|k, _| seen.contains(k));
    }

    pub fn tick(&mut self, obs: Observation, settings: &Settings) {
        let now = obs.now;

        if let Some(last) = self.last_tick {
            if now - last > SLEEP_GAP_MS || now < last {
                self.close(last);
            }
        }
        self.last_tick = Some(now);
        let idle = obs.idle_ms.unwrap_or(0);

        let info = if obs.paused { None } else { obs.window.and_then(RawWindow::into_info) };
        let info = info.filter(|w| !settings.ignored_apps.iter().any(|a| a == &w.app_key));


        let is_self = info.as_ref().is_some_and(|w| w.app_key == "ztally") && !settings.track_self;
        if is_self {
            self.close(now);
            self.current = Current { state: "self".into(), since: now, idle_ms: idle, ..Default::default() };
            return;
        }

        let Some(info) = info else {
            self.close(now);
            self.current = Current { state: if obs.paused { "paused" } else { "none" }.into(), since: now, idle_ms: idle, ..Default::default() };
            return;
        };


        let mut domain = None;
        let mut audible = false;
        let mut private = false;
        if browser::is_browser(&info.app_key) {
            private = info.title.contains("Private Browsing") || info.title.ends_with("(Incognito)");
            match self.bridge.match_window(&info.title) {
                Some(m) => {
                    self.ext_browser = Some(info.app_key.clone());
                    domain = m.domain;
                    audible = m.audible;
                    private |= m.incognito;
                }
                None => domain = browser::domain_from_title(&info.title),
            }
        }

        let hide_title = private || !settings.record_titles || settings.title_exclusions.iter().any(|a| a == &info.app_key);
        let title = if hide_title { String::new() } else { info.title.chars().take(512).collect() };
        if private {
            domain = None;
        }


        let focused_sound = self.sounding.contains(&info.app_key) && !browser::is_browser(&info.app_key) && !AUDIO_ONLY.contains(&info.app_key.as_str());
        let media = audible
            || focused_sound
            || settings.media_apps.iter().any(|m| {
                m == &info.app_key || domain.as_deref().is_some_and(|d| crate::classify::domain_matches(d, m))
            });
        let threshold = settings.idle_threshold_s.max(30) * 1000;
        let away = !media && idle >= threshold;

        let key = if away {
            SpanKey { app_key: String::new(), title: String::new(), domain: None, afk: true }
        } else {
            SpanKey { app_key: info.app_key.clone(), title, domain: domain.clone(), afk: false }
        };

        let same = self.open.as_ref().is_some_and(|s| s.key == key);
        if same {
            let s = self.open.as_mut().unwrap();
            s.end = now;
            if now - s.flushed_end >= FLUSH_EVERY_MS {
                let _ = self.db.lock().update_span_end(s.id, now);
                s.flushed_end = now;
            }
        } else {

            let start = if away {
                let went_idle = now - idle as i64;
                let from = self.open.as_ref().map(|s| went_idle.max(s.start)).unwrap_or(went_idle);
                self.close(from);
                from
            } else {
                self.close(now);
                now
            };
            let app_id = if away { None } else { self.app_id(&info) };
            let id = self
                .db
                .lock()
                .insert_span(start, now, app_id, &key.title, key.domain.as_deref(), key.afk)
                .unwrap_or(-1);
            self.open = Some(OpenSpan { id, key: key.clone(), start, end: now, flushed_end: now });
        }

        let since = self.open.as_ref().map(|s| s.start).unwrap_or(now);
        self.current = if away {
            Current { state: "away".into(), since, idle_ms: idle, ..Default::default() }
        } else {
            Current {
                state: "active".into(),
                app: Some(info.app_key),
                display: Some(info.display),
                title: Some(key.title),
                domain,
                since,
                idle_ms: idle,
            }
        };
    }
}


pub fn run(
    mut backend: Backend,
    mut audio: Box<dyn AudioSource>,
    engine: Arc<Mutex<Engine>>,
    settings: Arc<Mutex<Settings>>,
    paused_until: Arc<Mutex<i64>>,
    mut on_tick: impl FnMut(i64, bool),
) {
    let mut last_minute = 0i64;
    let mut last_audio = 0i64;
    loop {
        let now = chrono::Utc::now().timestamp_millis();
        let paused = *paused_until.lock() > now;
        let window = if paused { None } else { backend.window.sample() };
        let idle_ms = backend.idle.idle_ms();
        let st = settings.lock().clone();
        engine.lock().tick(Observation { now, window, idle_ms, paused }, &st);
        if now - last_audio >= 5_000 {
            last_audio = now;
            let playing = if st.track_background_audio && !paused { audio.playing() } else { vec![] };
            let mics = if st.track_calls && !paused { audio.mics() } else { vec![] };
            let mut e = engine.lock();
            e.audio_tick(now, playing, &st, paused);

            e.call_tick(now, mics, &st, paused);
        }
        let minute = now - last_minute >= 60_000;
        if minute {
            last_minute = now;
        }
        on_tick(now, minute);

        let sleep = 1000 - (chrono::Utc::now().timestamp_millis() % 1000);
        std::thread::sleep(Duration::from_millis(sleep.clamp(200, 1000) as u64));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(exe: &str, title: &str) -> Option<RawWindow> {
        Some(RawWindow { title: title.into(), exe: Some(format!("/usr/bin/{exe}")), class: None, pid: None })
    }

    fn setup() -> (Arc<Mutex<Db>>, Engine, Settings) {
        let db = Arc::new(Mutex::new(Db::open_in_memory().unwrap()));
        let e = Engine::new(db.clone(), Bridge::default());
        (db, e, Settings::default())
    }

    fn obs(now: i64, w: Option<RawWindow>, idle: u64) -> Observation {
        Observation { now, window: w, idle_ms: Some(idle), paused: false }
    }

    #[test]
    fn merges_heartbeats_and_splits_on_change() {
        let (db, mut e, st) = setup();
        for t in 0..30 {
            e.tick(obs(t * 1000, raw("konsole", "zsh"), 0), &st);
        }
        for t in 30..40 {
            e.tick(obs(t * 1000, raw("firefox", "Rust - YouTube — Mozilla Firefox"), 0), &st);
        }
        e.shutdown();
        let rows = db.lock().spans_in(0, 100_000).unwrap();
        assert_eq!(rows.len(), 2, "{rows:?}");
        assert_eq!((rows[0].app_key.as_str(), rows[0].start, rows[0].end), ("konsole", 0, 30_000));
        assert_eq!((rows[1].app_key.as_str(), rows[1].start, rows[1].end), ("firefox", 30_000, 39_000));
        assert_eq!(rows[1].domain.as_deref(), Some("youtube.com"));
    }

    #[test]
    fn idle_trims_back_and_records_away() {
        let (db, mut e, st) = setup();
        let thr = st.idle_threshold_s * 1000;

        for t in 0..=100 {
            e.tick(obs(t * 1000, raw("code", "main.rs"), 0), &st);
        }
        let mut t = 101;
        loop {
            let idle = (t - 100) as u64 * 1000;
            e.tick(obs(t * 1000, raw("code", "main.rs"), idle), &st);
            if idle > thr + 5000 {
                break;
            }
            t += 1;
        }
        e.shutdown();
        let rows = db.lock().spans_in(0, 10_000_000).unwrap();
        assert_eq!(rows.len(), 2, "{rows:?}");
        assert!(!rows[0].afk && rows[0].end == 100_000, "{rows:?}");
        assert!(rows[1].afk && rows[1].start == 100_000);
    }

    #[test]
    fn media_apps_are_never_away() {
        let (db, mut e, st) = setup();
        for t in 0..10 {
            e.tick(obs(t * 1000, raw("vlc", "movie.mkv"), 10_000_000), &st);
        }
        e.shutdown();
        let rows = db.lock().spans_in(0, 100_000).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(!rows[0].afk);
    }

    #[test]
    fn sleep_gap_closes_span() {
        let (db, mut e, st) = setup();
        for t in 0..10 {
            e.tick(obs(t * 1000, raw("code", "a"), 0), &st);
        }
        for t in 3600..3610 {
            e.tick(obs(t * 1000, raw("code", "a"), 0), &st);
        }
        e.shutdown();
        let rows = db.lock().spans_in(0, 10_000_000).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].end, 9_000);
        assert_eq!(rows[1].start, 3_600_000);
    }

    #[test]
    fn privacy_hides_titles() {
        let (db, mut e, mut st) = setup();
        st.record_titles = false;
        for t in 0..5 {
            e.tick(obs(t * 1000, raw("code", "secret.rs"), 0), &st);
        }
        e.shutdown();
        assert_eq!(db.lock().spans_in(0, 100_000).unwrap()[0].title, "");
    }

    #[test]
    fn does_not_track_itself_unless_enabled() {
        let (db, mut e, mut st) = setup();
        for t in 0..5 {
            e.tick(obs(t * 1000, raw("ztally", "ZTally"), 0), &st);
        }
        assert_eq!(e.current.state, "self");
        st.track_self = true;
        for t in 5..10 {
            e.tick(obs(t * 1000, raw("ztally", "ZTally"), 0), &st);
        }
        e.shutdown();
        let rows = db.lock().spans_in(0, 100_000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].start, 5_000);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn exe_for_rejects_unrelated_pids() {
        let me = Some(std::process::id());

        assert_eq!(exe_for(me, Some("firefox")), None);
        assert!(exe_for(me, None).is_some());
    }

    fn play(app: &str, title: &str) -> Playing {
        Playing { app: app.into(), display: None, title: title.into(), url: None, tab_active: false }
    }

    #[test]
    fn background_audio_is_separate_and_skips_the_focused_player() {
        let (db, mut e, st) = setup();
        for t in 0..60 {
            e.tick(obs(t * 1000, raw("code", "main.rs"), 0), &st);
            if t % 5 == 0 {
                e.audio_tick(t * 1000, vec![play("spotify", "Artist – Song A")], &st, false);
            }
        }

        for t in 60..70 {
            e.tick(obs(t * 1000, raw("spotify", "Spotify Premium"), 0), &st);
            if t % 5 == 0 {
                e.audio_tick(t * 1000, vec![play("spotify", "Artist – Song A")], &st, false);
            }
        }
        e.shutdown();
        let fg = db.lock().spans_in(0, 100_000).unwrap();
        let bg = db.lock().audio_in(0, 100_000).unwrap();
        assert_eq!(fg.iter().map(|r| r.app_key.as_str()).collect::<Vec<_>>(), ["code", "spotify"]);
        assert_eq!(bg.len(), 1);
        assert_eq!((bg[0].app_key.as_str(), bg[0].start, bg[0].end), ("spotify", 0, 55_000));
        assert_eq!(bg[0].title, "Artist – Song A");
    }

    #[test]
    fn track_changes_split_background_spans() {
        let (db, mut e, st) = setup();
        e.audio_tick(0, vec![play("org.mpris.MediaPlayer2.vlc", "a.mp3")], &st, false);
        e.audio_tick(5_000, vec![play("org.mpris.MediaPlayer2.vlc", "a.mp3")], &st, false);
        e.audio_tick(10_000, vec![play("org.mpris.MediaPlayer2.vlc", "b.mp3")], &st, false);
        e.audio_tick(15_000, vec![], &st, false);
        let bg = db.lock().audio_in(0, 100_000).unwrap();
        assert_eq!(bg.len(), 2);
        assert_eq!((bg[0].start, bg[0].end, bg[1].start, bg[1].end), (0, 5_000, 5_000, 10_000));
        assert_eq!(bg[0].app_key, "vlc");
    }

    #[test]
    fn paused_players_are_silent_but_unknown_streams_count() {
        let session = |app: &str, on: bool| (play(app, "Song"), on);
        let stream = |app: &str| play(app, "");


        let out = merge_audio(
            vec![session("spotify", false), session("vivaldi-stable", false)],
            vec![stream("spotify"), stream("hollow_knight"), stream("vivaldi-bin")],
        );
        let keys: Vec<_> = out.iter().map(|p| audio_app_key(&p.app)).collect();
        assert_eq!(keys, ["hollow_knight", "vivaldi"]);

        let out = merge_audio(vec![session("spotify", true)], vec![stream("spotify")]);
        assert_eq!((out.len(), out[0].title.as_str()), (1, "Song"));
    }

    #[test]
    fn background_tab_in_the_focused_browser_is_background() {
        let db = Arc::new(Mutex::new(Db::open_in_memory().unwrap()));
        let bridge = Bridge::default();
        let mut e = Engine::new(db.clone(), bridge.clone());
        let st = Settings::default();
        let tab = |url: &str, title: &str, active: bool| crate::browser::AudibleTab { url: url.into(), title: title.into(), incognito: false, active };
        bridge.record(crate::browser::TabReport {
            url: "https://github.com/x/y".into(),
            title: "x/y".into(),
            browser: "chromium".into(),
            audible: false,
            incognito: false,
            audible_tabs: vec![tab("https://www.youtube.com/watch?v=1", "Lofi mix - YouTube", false)],
        });
        for t in 0..20 {
            e.tick(obs(t * 1000, raw("vivaldi-bin", "x/y - Vivaldi"), 0), &st);
            if t % 5 == 0 {
                e.audio_tick(t * 1000, vec![play("vivaldi-bin", "")], &st, false);
            }
        }
        e.shutdown();
        let bg = db.lock().audio_in(0, 100_000).unwrap();
        assert_eq!(bg.len(), 1, "{bg:?}");
        assert_eq!((bg[0].app_key.as_str(), bg[0].domain.as_deref(), bg[0].title.as_str()), ("vivaldi", Some("youtube.com"), "Lofi mix - YouTube"));


        bridge.record(crate::browser::TabReport {
            url: "https://www.youtube.com/watch?v=1".into(),
            title: "Lofi mix - YouTube".into(),
            browser: "chromium".into(),
            audible: true,
            incognito: false,
            audible_tabs: vec![tab("https://www.youtube.com/watch?v=1", "Lofi mix - YouTube", true)],
        });
        let before = db.lock().audio_in(0, 1_000_000).unwrap().len();
        for t in 100..120 {
            e.tick(obs(t * 1000, raw("vivaldi-bin", "Lofi mix - YouTube - Vivaldi"), 0), &st);
            if t % 5 == 0 {
                e.audio_tick(t * 1000, vec![play("vivaldi-bin", "")], &st, false);
            }
        }
        assert_eq!(db.lock().audio_in(0, 1_000_000).unwrap().len(), before);
    }

    #[test]
    fn a_focused_app_making_sound_is_not_away_unless_its_a_music_player() {
        let (db, mut e, st) = setup();
        let idle = 10 * 60_000;
        e.audio_tick(0, vec![play("hollow_knight", "")], &st, false);
        for t in 0..10 {
            e.tick(obs(t * 1000, raw("hollow_knight", "Hollow Knight"), idle), &st);
        }
        assert_eq!(e.current.state, "active");
        e.audio_tick(10_000, vec![play("spotify", "Song")], &st, false);
        for t in 10..20 {
            e.tick(obs(t * 1000, raw("spotify", "Spotify Premium"), idle), &st);
        }
        assert_eq!(e.current.state, "away");
        e.shutdown();
        assert!(db.lock().spans_in(0, 100_000).unwrap().iter().any(|r| r.afk));
    }

    #[test]
    fn tracking_continues_after_a_factory_reset() {
        let (db, mut e, st) = setup();
        for t in 0..10 {
            e.tick(obs(t * 1000, raw("code", "main.rs"), 0), &st);
        }
        e.forget_cache();
        db.lock().wipe().unwrap();
        assert!(db.lock().spans_in(0, 100_000).unwrap().is_empty());
        assert!(!db.lock().categories().unwrap().is_empty(), "built-in categories come back");
        for t in 10..20 {
            e.tick(obs(t * 1000, raw("code", "main.rs"), 0), &st);
        }
        e.shutdown();
        let rows = db.lock().spans_in(0, 100_000).unwrap();
        assert_eq!(rows.len(), 1, "new spans must not point at deleted app rows");
        assert_eq!(rows[0].app_key, "code");
    }

    #[test]
    fn calls_are_recorded_in_front_too_and_keep_you_present() {
        let (db, mut e, st) = setup();
        let idle = 10 * 60_000;
        for t in 0..60 {
            e.tick(obs(t * 1000, raw("Discord", "#general - Discord"), idle), &st);
            if t % 5 == 0 {
                e.audio_tick(t * 1000, vec![play("Discord", "")], &st, false);
                e.call_tick(t * 1000, vec!["Discord".into()], &st, false);
            }
        }
        assert_eq!(e.current.state, "active", "on a call is not away");
        e.shutdown();
        let calls = db.lock().calls_in(0, 100_000).unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!((calls[0].app_key.as_str(), calls[0].start, calls[0].end), ("discord", 0, 55_000));

        assert!(db.lock().audio_in(0, 100_000).unwrap().is_empty());
    }

    #[test]
    fn audio_keys_match_foreground_keys() {
        assert_eq!(audio_app_key("spotify"), "spotify");
        assert_eq!(audio_app_key("Spotify.exe"), "spotify");
        assert_eq!(audio_app_key("vivaldi-stable"), "vivaldi");
        assert_eq!(audio_app_key("org.mozilla.firefox"), "firefox");
        assert_eq!(audio_app_key("308046B0AF4A39CB"), "firefox");
        assert_eq!(audio_app_key("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), "zunemusic");
        assert_eq!(audio_app_key("MSEdge"), "msedge");
    }

    #[test]
    fn pause_stops_recording() {
        let (db, mut e, st) = setup();
        for t in 0..5 {
            e.tick(obs(t * 1000, raw("code", "a"), 0), &st);
        }
        for t in 5..10 {
            e.tick(Observation { now: t * 1000, window: None, idle_ms: Some(0), paused: true }, &st);
        }
        assert_eq!(e.current.state, "paused");
        e.shutdown();
        let rows = db.lock().spans_in(0, 100_000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].end, 5_000);
    }
}

#[cfg(test)]
mod live {

    #[test]
    #[ignore]
    fn live_sample() {
        let mut b = super::detect();
        println!("backend: {:?}", b.info);
        let mut audio = super::audio_source();
        println!("playing: {:?}", audio.playing());
        println!("mics: {:?}", audio.mics());
        for _ in 0..3 {
            let w = b.window.sample();
            println!("window: {:?}\n  -> {:?}\n  idle: {:?}", w, w.clone().and_then(|w| w.into_info()), b.idle.idle_ms());
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }
}
