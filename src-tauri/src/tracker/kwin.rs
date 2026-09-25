

use super::{exe_for, ActiveWindowSource, Backend, BackendInfo, IdleSource, LogindIdle};
use crate::model::RawWindow;
use parking_lot::Mutex;
use std::sync::Arc;
use zbus::blocking::{connection, Connection, Proxy};

const SERVICE: &str = "eu.zsync.ZTally";
const PATH: &str = "/eu/zsync/ZTally";
const PLUGIN: &str = "ztally-focus";
const SCRIPT: &str = include_str!("../../resources/kwin-script/ztally.js");

type Shared = Arc<Mutex<Option<RawWindow>>>;

struct Receiver(Shared);

#[zbus::interface(name = "eu.zsync.ZTally.KWin")]
impl Receiver {
    fn update(&self, class: String, caption: String, pid: i32) {
        let w = if class.is_empty() && caption.is_empty() {
            None
        } else {
            let pid = u32::try_from(pid).ok().filter(|p| *p > 0);
            {
                let class = Some(class).filter(|c| !c.is_empty());
                let exe = exe_for(pid, class.as_deref());
                Some(RawWindow { title: caption, exe, class, pid })
            }
        };
        *self.0.lock() = w;
    }
}

pub struct KWinWindow {
    shared: Shared,
    _conn: Connection,
}

impl ActiveWindowSource for KWinWindow {
    fn sample(&mut self) -> Option<RawWindow> {
        self.shared.lock().clone()
    }
}

fn load_script(conn: &Connection) -> Result<(), String> {
    let dir = std::env::temp_dir().join(format!("ztally-{}", std::process::id()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join("ztally-kwin.js");
    std::fs::write(&file, SCRIPT).map_err(|e| e.to_string())?;

    let scripting = Proxy::new(conn, "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting").map_err(|e| e.to_string())?;
    let _: Result<bool, _> = scripting.call("unloadScript", &(PLUGIN,));
    let id: i32 = scripting.call("loadScript", &(file.to_string_lossy().as_ref(), PLUGIN)).map_err(|e| e.to_string())?;
    if id < 0 {
        return Err("KWin refused to load the script".into());
    }

    for path in [format!("/Scripting/Script{id}"), format!("/{id}")] {
        if let Ok(p) = Proxy::new(conn, "org.kde.KWin", path.as_str(), "org.kde.kwin.Script") {
            if p.call::<_, _, ()>("run", &()).is_ok() {
                return Ok(());
            }
        }
    }

    scripting.call::<_, _, ()>("start", &()).map_err(|e| e.to_string())
}

struct KdeIdle {
    conn: Connection,
    fallback: LogindIdle,
}

impl IdleSource for KdeIdle {
    fn idle_ms(&mut self) -> Option<u64> {

        let r: Option<u32> = Proxy::new(&self.conn, "org.freedesktop.ScreenSaver", "/ScreenSaver", "org.freedesktop.ScreenSaver")
            .ok()
            .and_then(|p| p.call("GetSessionIdleTime", &()).ok());
        r.map(u64::from).or_else(|| self.fallback.idle_ms())
    }
}

pub fn backend() -> Backend {
    let shared: Shared = Default::default();
    let conn = connection::Builder::session()
        .and_then(|b| b.name(SERVICE))
        .and_then(|b| b.serve_at(PATH, Receiver(shared.clone())))
        .and_then(|b| b.build());
    let conn = match conn {
        Ok(c) => c,
        Err(e) => return Backend::none("KDE Plasma", &format!("Could not register on the session bus: {e}")),
    };
    let loaded = load_script(&conn);
    let idle_conn = Connection::session().ok();
    let idle_supported = idle_conn.is_some();
    let idle: Box<dyn IdleSource> = match idle_conn {
        Some(c) => Box::new(KdeIdle { conn: c, fallback: LogindIdle::new() }),
        None => Box::new(LogindIdle::new()),
    };
    Backend {
        window: Box::new(KWinWindow { shared, _conn: conn }),
        idle,
        info: BackendInfo {
            id: "kwin",
            label: "KDE Plasma (KWin script)".into(),
            ok: loaded.is_ok(),
            idle_supported,
            note: loaded.err().map(|e| format!("Could not load the KWin helper script: {e}")),
            fix: None,
        },
    }
}
