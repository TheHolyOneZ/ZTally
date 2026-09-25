

use super::{exe_for, ActiveWindowSource, Backend, BackendInfo, IdleSource};
use crate::model::RawWindow;
use x11rb::connection::Connection;
use x11rb::protocol::screensaver::ConnectionExt as _;
use x11rb::protocol::xproto::{Atom, AtomEnum, ConnectionExt as _, Window};
use x11rb::rust_connection::RustConnection;

struct Atoms {
    active: Atom,
    net_wm_name: Atom,
    utf8: Atom,
    pid: Atom,
}

struct X {
    conn: RustConnection,
    root: Window,
    atoms: Atoms,
}

impl X {
    fn connect() -> Option<Self> {
        let (conn, screen) = x11rb::connect(None).ok()?;
        let root = conn.setup().roots.get(screen)?.root;
        let intern = |name: &[u8]| -> Option<Atom> { Some(conn.intern_atom(false, name).ok()?.reply().ok()?.atom) };
        let atoms = Atoms {
            active: intern(b"_NET_ACTIVE_WINDOW")?,
            net_wm_name: intern(b"_NET_WM_NAME")?,
            utf8: intern(b"UTF8_STRING")?,
            pid: intern(b"_NET_WM_PID")?,
        };
        Some(X { conn, root, atoms })
    }

    fn prop_bytes(&self, win: Window, prop: Atom, ty: impl Into<Atom>) -> Option<Vec<u8>> {
        let r = self.conn.get_property(false, win, prop, ty, 0, 4096).ok()?.reply().ok()?;
        if r.value.is_empty() { None } else { Some(r.value) }
    }

    fn prop_u32(&self, win: Window, prop: Atom, ty: impl Into<Atom>) -> Option<u32> {
        let r = self.conn.get_property(false, win, prop, ty, 0, 1).ok()?.reply().ok()?;
        let v = r.value32()?.next();
        v
    }

    fn sample(&self) -> Result<Option<RawWindow>, ()> {

        let reply = self
            .conn
            .get_property(false, self.root, self.atoms.active, AtomEnum::WINDOW, 0, 1)
            .map_err(|_| ())?
            .reply()
            .map_err(|_| ())?;
        let Some(win) = reply.value32().and_then(|mut v| v.next()).filter(|w| *w != 0) else {
            return Ok(None);
        };
        let title = self
            .prop_bytes(win, self.atoms.net_wm_name, self.atoms.utf8)
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .or_else(|| {
                self.prop_bytes(win, AtomEnum::WM_NAME.into(), AtomEnum::STRING)
                    .map(|b| b.iter().map(|&c| c as char).collect())
            })
            .unwrap_or_default();

        let class = self.prop_bytes(win, AtomEnum::WM_CLASS.into(), AtomEnum::STRING).and_then(|b| {
            let parts: Vec<&[u8]> = b.split(|c| *c == 0).filter(|p| !p.is_empty()).collect();
            parts.get(1).or(parts.first()).map(|p| String::from_utf8_lossy(p).into_owned())
        });
        let pid = self.prop_u32(win, self.atoms.pid, AtomEnum::CARDINAL);
        let exe = exe_for(pid, class.as_deref());
        Ok(Some(RawWindow { title, exe, class, pid }))
    }

    fn idle(&self) -> Option<u64> {
        let r = self.conn.screensaver_query_info(self.root).ok()?.reply().ok()?;
        Some(r.ms_since_user_input as u64)
    }
}

pub struct X11Window(Option<X>);
pub struct X11Idle(Option<X>);

impl ActiveWindowSource for X11Window {
    fn sample(&mut self) -> Option<RawWindow> {
        if self.0.is_none() {
            self.0 = X::connect();
        }
        match self.0.as_ref()?.sample() {
            Ok(w) => w,
            Err(()) => {
                self.0 = None;
                None
            }
        }
    }
}

impl IdleSource for X11Idle {
    fn idle_ms(&mut self) -> Option<u64> {
        if self.0.is_none() {
            self.0 = X::connect();
        }
        let v = self.0.as_ref()?.idle();
        if v.is_none() {
            self.0 = None;
        }
        v
    }
}

pub fn backend() -> Backend {
    let Some(x) = X::connect() else {
        return Backend::none("X11", "Could not connect to the X server ($DISPLAY).");
    };
    let idle = X::connect();
    let idle_ok = idle.as_ref().and_then(X::idle).is_some();
    let ok = x.conn.get_property(false, x.root, x.atoms.active, AtomEnum::WINDOW, 0, 1).is_ok();
    Backend {
        window: Box::new(X11Window(Some(x))),
        idle: Box::new(X11Idle(idle)),
        info: BackendInfo {
            id: "x11",
            label: "X11".into(),
            ok,
            idle_supported: idle_ok,
            note: (!idle_ok).then(|| "The XScreenSaver extension is unavailable, so idle time cannot be detected.".into()),
            fix: None,
        },
    }
}
