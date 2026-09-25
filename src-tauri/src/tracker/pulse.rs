

use super::Playing;
use std::process::Command;


const IGNORED_ROLES: &[&str] = &["event", "a11y", "test"];


const MIC_MONITORS: &[&str] = &[
    "pavucontrol", "pwvucontrol", "plasmashell", "kmix", "easyeffects", "gnome-shell", "gnome-control-center",
    "cinnamon", "xfce4-pulseaudio-plugin", "pasystray", "noisetorch", "carla", "qpwgraph", "helvum", "cava",
    "pipewire", "wireplumber", "ztally",
];

#[derive(Debug, Default, PartialEq)]
struct Stream {
    corked: bool,

    silent: bool,
    binary: Option<String>,
    name: Option<String>,
    media: Option<String>,
    role: Option<String>,
    pid: Option<u32>,
}


fn parse(text: &str) -> Vec<Stream> {
    let mut out = vec![];
    let mut cur: Option<Stream> = None;
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with("Sink Input #") || l.starts_with("Source Output #") {
            out.extend(cur.take());
            cur = Some(Stream::default());
            continue;
        }
        let Some(s) = cur.as_mut() else { continue };
        if let Some(v) = l.strip_prefix("Corked:") {
            s.corked = v.trim() == "yes";
        } else if let Some(v) = l.strip_prefix("Mute:") {
            s.silent |= v.trim() == "yes";
        } else if let Some(v) = l.strip_prefix("Volume:") {

            let raw: Vec<u32> = v.split(',').filter_map(|ch| ch.split(':').nth(1)?.split('/').next()?.trim().parse().ok()).collect();
            s.silent |= !raw.is_empty() && raw.iter().all(|&x| x == 0);
        } else if let Some((k, v)) = l.split_once(" = ") {
            let v = v.trim().trim_matches('"').to_string();
            match k.trim() {
                "application.process.binary" => s.binary = Some(v),
                "application.name" => s.name = Some(v),
                "media.name" => s.media = Some(v),
                "media.role" => s.role = Some(v.to_lowercase()),
                "application.process.id" => s.pid = v.parse().ok(),
                _ => {}
            }
        }
    }
    out.extend(cur);
    out
}

fn to_playing(streams: Vec<Stream>, own_pid: u32) -> Vec<Playing> {
    streams
        .into_iter()
        .filter(|s| !s.corked && !s.silent && s.pid != Some(own_pid))
        .filter(|s| !s.role.as_deref().is_some_and(|r| IGNORED_ROLES.contains(&r)))
        .filter_map(|s| {
            let app = s.binary.clone().or(s.name.clone())?;
            Some(Playing { app, display: s.name, title: String::new(), url: None, tab_active: false })
        })
        .collect()
}


fn to_mics(streams: Vec<Stream>, own_pid: u32) -> Vec<String> {
    streams
        .into_iter()
        .filter(|s| !s.corked && s.pid != Some(own_pid) && s.media.as_deref() != Some("Peak detect"))
        .filter_map(|s| s.binary.or(s.name))
        .filter(|app| !MIC_MONITORS.contains(&super::audio_app_key(app).as_str()))
        .collect()
}

pub struct Pulse {
    available: bool,
}

impl Pulse {
    pub fn new() -> Self {
        Self { available: true }
    }

    fn list(&mut self, what: &str) -> Option<Vec<Stream>> {
        if !self.available {
            return None;
        }
        match Command::new("pactl").env("LC_ALL", "C").args(["list", what]).output() {
            Ok(o) if o.status.success() => Some(parse(&String::from_utf8_lossy(&o.stdout))),
            Ok(_) => None,
            Err(_) => {

                self.available = false;
                None
            }
        }
    }

    pub fn mics(&mut self) -> Vec<String> {
        self.list("source-outputs").map(|s| to_mics(s, std::process::id())).unwrap_or_default()
    }

    pub fn playing(&mut self) -> Vec<Playing> {
        if !self.available {
            return vec![];
        }
        match Command::new("pactl").env("LC_ALL", "C").args(["list", "sink-inputs"]).output() {
            Ok(o) if o.status.success() => to_playing(parse(&String::from_utf8_lossy(&o.stdout)), std::process::id()),
            Ok(_) => vec![],
            Err(_) => {

                self.available = false;
                vec![]
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"Sink Input #71
	Driver: PipeWire
	Corked: no
	Properties:
		media.name = "Spotify"
		application.name = "spotify"
		application.process.id = "4242"
		application.process.binary = "spotify"
Sink Input #88
	Corked: yes
	Properties:
		application.name = "VLC media player (LibVLC 3.0.20)"
		application.process.binary = "vlc"
Sink Input #90
	Corked: no
	Properties:
		application.name = "KDE System Notifications"
		media.role = "event"
		application.process.binary = "plasmashell"
Sink Input #93
	Corked: no
	Mute: yes
	Properties:
		application.process.binary = "discord"
Sink Input #94
	Corked: no
	Mute: no
	Volume: front-left: 0 /   0% / -inf dB,   front-right: 0 /   0% / -inf dB
	Properties:
		application.process.binary = "steam"
Sink Input #95
	Corked: no
	Volume: front-left: 45000 /  69% / -9.80 dB,   front-right: 45000 /  69% / -9.80 dB
	Properties:
		application.name = "Vivaldi"
		application.process.binary = "vivaldi-bin"
		application.process.id = "777"
"#;

    #[test]
    fn mic_users_without_level_meters() {
        let text = r#"Source Output #693
	Corked: no
	Properties:
		application.name = "WEBRTC VoiceEngine"
		media.name = "recStream"
		application.process.binary = "Discord"
Source Output #700
	Corked: no
	Properties:
		media.name = "Peak detect"
		application.process.binary = "pavucontrol"
Source Output #701
	Corked: no
	Properties:
		application.process.binary = "plasmashell"
Source Output #702
	Corked: yes
	Properties:
		application.process.binary = "obs"
"#;
        assert_eq!(to_mics(parse(text), 1), ["Discord"]);
    }

    #[test]
    fn keeps_only_audible_non_system_streams() {
        let p = to_playing(parse(SAMPLE), 777);


        assert_eq!(p.iter().map(|x| x.app.as_str()).collect::<Vec<_>>(), ["spotify"]);
        let p = to_playing(parse(SAMPLE), 1);
        assert_eq!(p.len(), 2);
        assert_eq!(super::super::audio_app_key(&p[1].app), "vivaldi");
    }
}
