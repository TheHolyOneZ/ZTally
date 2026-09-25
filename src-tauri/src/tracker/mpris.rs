

use super::Playing;
use std::collections::HashMap;
use zbus::blocking::Connection;
use zbus::zvariant::OwnedValue;

const PREFIX: &str = "org.mpris.MediaPlayer2.";
const PATH: &str = "/org/mpris/MediaPlayer2";

pub struct Mpris {
    conn: Option<Connection>,
}

impl Mpris {
    pub fn new() -> Self {
        Self { conn: Connection::session().ok() }
    }
}

fn get_all(conn: &Connection, dest: &str, iface: &str) -> Option<HashMap<String, OwnedValue>> {
    let reply = conn
        .call_method(Some(dest), PATH, Some("org.freedesktop.DBus.Properties"), "GetAll", &(iface,))
        .ok()?;
    reply.body().deserialize().ok()
}

fn take_string(m: &mut HashMap<String, OwnedValue>, k: &str) -> Option<String> {
    m.remove(k).and_then(|v| String::try_from(v).ok()).filter(|s| !s.is_empty())
}

impl Mpris {

    pub fn players(&mut self) -> Vec<(Playing, bool)> {
        let Some(conn) = self.conn.as_ref() else { return vec![] };
        let Ok(dbus) = zbus::blocking::fdo::DBusProxy::new(conn) else { return vec![] };
        let Ok(names) = dbus.list_names() else {
            self.conn = Connection::session().ok();
            return vec![];
        };
        let mut out = vec![];
        for name in names.iter().map(|n| n.as_str()).filter(|n| n.starts_with(PREFIX)) {
            let suffix = &name[PREFIX.len()..];

            if suffix.starts_with("playerctld") {
                continue;
            }
            let Some(mut player) = get_all(conn, name, "org.mpris.MediaPlayer2.Player") else { continue };
            let is_playing = take_string(&mut player, "PlaybackStatus").as_deref() == Some("Playing");
            let mut meta: HashMap<String, OwnedValue> =
                player.remove("Metadata").and_then(|v| HashMap::try_from(v).ok()).unwrap_or_default();
            let title = take_string(&mut meta, "xesam:title").unwrap_or_default();
            let artist = meta
                .remove("xesam:artist")
                .and_then(|v| Vec::<String>::try_from(v).ok())
                .map(|a| a.join(", "))
                .filter(|a| !a.is_empty());
            let url = take_string(&mut meta, "xesam:url");

            let mut root = get_all(conn, name, "org.mpris.MediaPlayer2").unwrap_or_default();
            let desktop = take_string(&mut root, "DesktopEntry");
            let identity = take_string(&mut root, "Identity");

            let bus_app = suffix.split('.').next().unwrap_or(suffix).to_string();
            out.push((
                Playing {
                    app: desktop.unwrap_or(bus_app),
                    display: identity,
                    title: match artist {
                        Some(a) if !title.is_empty() => format!("{a} – {title}"),
                        _ => title,
                    },
                    url,
                    tab_active: false,
                },
                is_playing,
            ));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use zbus::zvariant::{OwnedValue, Str};

    struct Root;
    #[zbus::interface(name = "org.mpris.MediaPlayer2")]
    impl Root {
        #[zbus(property)]
        fn identity(&self) -> String {
            "Mock Player".into()
        }
        #[zbus(property)]
        fn desktop_entry(&self) -> String {
            "mockplayer".into()
        }
    }

    struct Player;
    #[zbus::interface(name = "org.mpris.MediaPlayer2.Player")]
    impl Player {
        #[zbus(property)]
        fn playback_status(&self) -> String {
            "Playing".into()
        }
        #[zbus(property)]
        fn metadata(&self) -> HashMap<String, OwnedValue> {
            let mut m = HashMap::new();
            m.insert("xesam:title".into(), OwnedValue::from(Str::from("Song A")));
            m.insert("xesam:artist".into(), OwnedValue::try_from(zbus::zvariant::Value::from(vec!["Band"])).unwrap());
            m
        }
    }


    #[test]
    #[ignore]
    fn mpris_reads_a_playing_player() {
        let _svc = zbus::blocking::connection::Builder::session()
            .unwrap()
            .name("org.mpris.MediaPlayer2.mockplayer.instance1")
            .unwrap()
            .serve_at(PATH, Root)
            .unwrap()
            .serve_at(PATH, Player)
            .unwrap()
            .build()
            .unwrap();
        let found: Vec<Playing> = Mpris::new().players().into_iter().filter(|p| p.1).map(|p| p.0).collect();
        let mock = found.iter().find(|p| p.app == "mockplayer").expect("mock player not found");
        assert_eq!(mock.title, "Band – Song A");
        assert_eq!(mock.display.as_deref(), Some("Mock Player"));
    }
}
