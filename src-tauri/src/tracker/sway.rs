

use super::{exe_for, ActiveWindowSource, Backend, BackendInfo, LogindIdle};
use crate::model::RawWindow;
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::time::Duration;

const MAGIC: &[u8] = b"i3-ipc";
const GET_TREE: u32 = 4;

fn request(path: &str, ty: u32) -> Option<serde_json::Value> {
    let mut s = UnixStream::connect(path).ok()?;
    s.set_read_timeout(Some(Duration::from_millis(500))).ok()?;
    let mut msg = Vec::with_capacity(14);
    msg.extend_from_slice(MAGIC);
    msg.extend_from_slice(&0u32.to_ne_bytes());
    msg.extend_from_slice(&ty.to_ne_bytes());
    s.write_all(&msg).ok()?;
    let mut header = [0u8; 14];
    s.read_exact(&mut header).ok()?;
    if &header[..6] != MAGIC {
        return None;
    }
    let len = u32::from_ne_bytes(header[6..10].try_into().ok()?) as usize;
    if len > 64 * 1024 * 1024 {
        return None;
    }
    let mut body = vec![0u8; len];
    s.read_exact(&mut body).ok()?;
    serde_json::from_slice(&body).ok()
}

fn find_focused(node: &serde_json::Value) -> Option<&serde_json::Value> {
    if node.get("focused").and_then(|f| f.as_bool()) == Some(true) && node.get("pid").is_some() {
        return Some(node);
    }
    for key in ["nodes", "floating_nodes"] {
        if let Some(children) = node.get(key).and_then(|n| n.as_array()) {
            for c in children {
                if let Some(f) = find_focused(c) {
                    return Some(f);
                }
            }
        }
    }
    None
}

pub struct SwayWindow {
    socket: String,
}

impl ActiveWindowSource for SwayWindow {
    fn sample(&mut self) -> Option<RawWindow> {
        let tree = request(&self.socket, GET_TREE)?;
        let n = find_focused(&tree)?;
        let title = n.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();

        let class = n
            .get("app_id")
            .and_then(|v| v.as_str())
            .or_else(|| n.pointer("/window_properties/class").and_then(|v| v.as_str()))
            .map(str::to_string);
        let pid = n.get("pid").and_then(|v| v.as_u64()).map(|p| p as u32);
        Some(RawWindow { title, exe: exe_for(pid, class.as_deref()), class, pid })
    }
}

pub fn backend() -> Backend {
    let Ok(socket) = std::env::var("SWAYSOCK") else {
        return Backend::none("Sway", "$SWAYSOCK is not set.");
    };
    let ok = request(&socket, GET_TREE).is_some();
    Backend {
        window: Box::new(SwayWindow { socket }),
        idle: Box::new(LogindIdle::new()),
        info: BackendInfo {
            id: "sway",
            label: "Sway".into(),
            ok,
            idle_supported: true,
            note: Some("Idle detection uses logind's idle hint; make sure swayidle (or similar) is running.".into()),
            fix: None,
        },
    }
}
