

use super::{exe_for, ActiveWindowSource, Backend, BackendInfo, IdleSource};
use crate::model::RawWindow;
use zbus::blocking::{Connection, Proxy};

pub const UUID: &str = "ztally@zsync.eu";
const METADATA: &str = include_str!("../../resources/gnome-extension/metadata.json");
const EXTENSION_JS: &str = include_str!("../../resources/gnome-extension/extension.js");

pub struct GnomeWindow {
    conn: Connection,
}

impl GnomeWindow {
    fn query(&self) -> zbus::Result<(String, String, i32)> {
        Proxy::new(&self.conn, "org.gnome.Shell", "/eu/zsync/ZTally", "eu.zsync.ZTally.Focus")?.call("GetFocused", &())
    }
}

impl ActiveWindowSource for GnomeWindow {
    fn sample(&mut self) -> Option<RawWindow> {
        let (class, title, pid) = self.query().ok()?;
        if class.is_empty() && title.is_empty() {
            return None;
        }
        let pid = u32::try_from(pid).ok().filter(|p| *p > 0);
        let class = Some(class).filter(|c| !c.is_empty());
        let exe = exe_for(pid, class.as_deref());
        Some(RawWindow { title, exe, class, pid })
    }
}

pub struct MutterIdle {
    conn: Connection,
}

impl IdleSource for MutterIdle {
    fn idle_ms(&mut self) -> Option<u64> {
        Proxy::new(&self.conn, "org.gnome.Mutter.IdleMonitor", "/org/gnome/Mutter/IdleMonitor/Core", "org.gnome.Mutter.IdleMonitor")
            .ok()?
            .call("GetIdletime", &())
            .ok()
    }
}


pub fn install_extension() -> Result<String, String> {
    let dir = dirs::data_dir().ok_or("no data dir")?.join("gnome-shell/extensions").join(UUID);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("metadata.json"), METADATA).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("extension.js"), EXTENSION_JS).map_err(|e| e.to_string())?;

    let enabled = std::process::Command::new("gnome-extensions").args(["enable", UUID]).status().is_ok_and(|s| s.success());
    if !enabled {

        let out = std::process::Command::new("gsettings")
            .args(["get", "org.gnome.shell", "enabled-extensions"])
            .output()
            .map_err(|e| e.to_string())?;
        let list = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !list.contains(UUID) {
            let new = if list.starts_with("@as []") || list == "[]" || list.is_empty() {
                format!("['{UUID}']")
            } else {
                format!("{}, '{UUID}']", list.trim_end_matches(']'))
            };
            std::process::Command::new("gsettings")
                .args(["set", "org.gnome.shell", "enabled-extensions", &new])
                .status()
                .map_err(|e| e.to_string())?;
        }
        return Ok("Installed. Log out and back in once so GNOME loads the ZTally extension.".into());
    }
    Ok("Installed and enabled.".into())
}

pub fn backend() -> Backend {
    let Ok(conn) = Connection::session() else {
        return Backend::none("GNOME (Wayland)", "Could not connect to the session bus.");
    };
    let win = GnomeWindow { conn: conn.clone() };
    let ok = win.query().is_ok();
    let idle = MutterIdle { conn };
    Backend {
        window: Box::new(win),
        idle: Box::new(idle),
        info: BackendInfo {
            id: "gnome",
            label: "GNOME (Wayland)".into(),
            ok,
            idle_supported: true,
            note: (!ok).then(|| {
                "GNOME on Wayland hides the focused window from apps. Install the small ZTally Shell extension to enable tracking."
                    .into()
            }),
            fix: (!ok).then_some("gnome-extension"),
        },
    }
}
