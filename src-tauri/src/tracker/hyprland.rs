

use super::{exe_for, ActiveWindowSource, Backend, BackendInfo, LogindIdle};
use crate::model::RawWindow;
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

fn socket_path() -> Option<PathBuf> {
    let sig = std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok()?;

    let mut candidates = vec![];
    if let Ok(rt) = std::env::var("XDG_RUNTIME_DIR") {
        candidates.push(PathBuf::from(rt).join("hypr").join(&sig).join(".socket.sock"));
    }
    candidates.push(PathBuf::from("/tmp/hypr").join(&sig).join(".socket.sock"));
    candidates.into_iter().find(|p| p.exists())
}

fn query(path: &PathBuf) -> Option<serde_json::Value> {
    let mut s = UnixStream::connect(path).ok()?;
    s.set_read_timeout(Some(Duration::from_millis(500))).ok()?;
    s.write_all(b"j/activewindow").ok()?;
    let mut buf = Vec::new();
    s.read_to_end(&mut buf).ok()?;
    serde_json::from_slice(&buf).ok()
}

pub struct HyprWindow {
    path: PathBuf,
}

impl ActiveWindowSource for HyprWindow {
    fn sample(&mut self) -> Option<RawWindow> {
        let v = query(&self.path)?;
        let title = v.get("title").and_then(|t| t.as_str()).unwrap_or_default().to_string();
        let class = v
            .get("class")
            .and_then(|t| t.as_str())
            .filter(|c| !c.is_empty())
            .or_else(|| v.get("initialClass").and_then(|t| t.as_str()))
            .map(str::to_string);
        let pid = v.get("pid").and_then(|p| p.as_i64()).and_then(|p| u32::try_from(p).ok()).filter(|p| *p > 0);
        if class.is_none() && title.is_empty() {
            return None;
        }
        Some(RawWindow { title, exe: exe_for(pid, class.as_deref()), class, pid })
    }
}

pub fn backend() -> Backend {
    let Some(path) = socket_path() else {
        return Backend::none("Hyprland", "Could not find the Hyprland IPC socket.");
    };
    let ok = query(&path).is_some();
    Backend {
        window: Box::new(HyprWindow { path }),
        idle: Box::new(LogindIdle::new()),
        info: BackendInfo {
            id: "hyprland",
            label: "Hyprland".into(),
            ok,
            idle_supported: true,
            note: Some("Idle detection uses logind's idle hint; make sure hypridle (or similar) is running.".into()),
            fix: None,
        },
    }
}
