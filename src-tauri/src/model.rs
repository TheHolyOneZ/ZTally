

use serde::{Deserialize, Serialize};


#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RawWindow {
    pub title: String,

    pub exe: Option<String>,

    pub class: Option<String>,
    pub pid: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WindowInfo {
    pub app_key: String,
    pub display: String,
    pub exe: Option<String>,
    pub class: Option<String>,
    pub title: String,
}


const GENERIC_HOSTS: &[&str] = &[
    "electron", "python", "python3", "java", "javaw", "node", "bwrap", "mono", "sh", "bash", "wine",
    "wine64", "wine64-preloader", "wine-preloader", "flatpak", "flatpak-spawn", "applicationframehost",
    "qemu-system-x86_64", "appimagelauncher", "zypak-helper", "gjs", "perl", "ruby", "dotnet",
];

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn is_generic_host(key: &str) -> bool {
    GENERIC_HOSTS.contains(&key)
}


pub fn normalize_exe(path: &str) -> String {

    let file = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let mut s = file.trim().to_lowercase();

    for suffix in [".exe", "-win64-shipping", "-wingdk-shipping", ".bin", "-bin", "-wrapped", ".appimage", "-stable", "-beta", "-nightly"] {
        if let Some(stripped) = s.strip_suffix(suffix) {
            s = stripped.to_string();
        }
    }
    let s = s.trim_start_matches('.').to_string();

    if let Some(base) = ["python", "electron", "java"].iter().find(|b| s.starts_with(**b)) {
        let rest = &s[base.len()..];
        if rest.chars().all(|c| c.is_ascii_digit() || c == '.') {
            return if *base == "python" && rest.starts_with('3') { "python3".into() } else { (*base).into() };
        }
    }
    s
}

pub fn normalize_class(class: &str) -> String {
    let c = class.trim().to_lowercase();

    let c = if c.contains('.') && c.split('.').count() >= 3 && !c.contains(' ') {
        c.rsplit('.').next().unwrap_or(&c).to_string()
    } else {
        c
    };

    normalize_exe(&c)
}

pub fn prettify(key: &str) -> String {
    let mut out = String::with_capacity(key.len());
    let mut up = true;
    for ch in key.chars() {
        if ch == '-' || ch == '_' {
            out.push(' ');
            up = true;
        } else if up {
            out.extend(ch.to_uppercase());
            up = false;
        } else {
            out.push(ch);
        }
    }
    out
}

impl RawWindow {
    pub fn into_info(self) -> Option<WindowInfo> {
        let exe_key = self.exe.as_deref().map(normalize_exe).filter(|s| !s.is_empty());
        let class_key = self.class.as_deref().map(normalize_class).filter(|s| !s.is_empty());
        let generic = exe_key.as_deref().is_none_or(|k| GENERIC_HOSTS.contains(&k));

        let app_key = match (&exe_key, &class_key) {
            (Some(e), _) if !generic => e.clone(),
            (_, Some(c)) => c.clone(),
            (Some(e), None) if e == "applicationframehost" => {

                let t = self.title.rsplit(" - ").next().unwrap_or(&self.title).trim().to_lowercase();
                if t.is_empty() { e.clone() } else { t }
            }
            (Some(e), None) => e.clone(),
            (None, None) => return None,
        };

        let display = crate::seed::display_name(&app_key)
            .map(str::to_string)
            .or_else(|| {
                self.class
                    .as_deref()
                    .filter(|c| normalize_class(c) == app_key && !c.contains('.') && c.chars().any(char::is_uppercase))
                    .map(str::to_string)
            })
            .unwrap_or_else(|| prettify(&app_key));

        Some(WindowInfo { app_key, display, exe: self.exe, class: self.class, title: self.title })
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub idle_threshold_s: u64,
    pub record_titles: bool,

    pub title_exclusions: Vec<String>,

    pub media_apps: Vec<String>,

    pub ignored_apps: Vec<String>,
    pub onboarded: bool,
    pub theme: String,
    pub week_starts_monday: bool,
    pub notifications: bool,
    pub weekly_report_notice: bool,
    pub bridge_port: u16,

    pub track_self: bool,

    pub focus_minutes: i64,

    pub track_background_audio: bool,

    pub language: String,

    pub style: String,

    pub corners: String,

    pub ui_scale: i64,

    pub font: String,
    pub reduce_motion: bool,

    pub track_calls: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            idle_threshold_s: 180,
            record_titles: true,
            title_exclusions: vec!["keepassxc".into(), "bitwarden".into(), "1password".into()],
            media_apps: vec![
                "vlc".into(), "mpv".into(), "celluloid".into(), "totem".into(), "haruna".into(), "zoom".into(),
                "teams".into(), "ms-teams".into(), "stremio".into(), "kodi".into(), "netflix".into(),
                "jellyfinmediaplayer".into(), "freetube".into(), "youtube.com".into(), "netflix.com".into(),
                "twitch.tv".into(), "meet.google.com".into(), "primevideo.com".into(), "disneyplus.com".into(),
                "vimeo.com".into(),
            ],
            ignored_apps: vec![],
            onboarded: false,
            theme: "system".into(),
            week_starts_monday: true,
            notifications: true,
            weekly_report_notice: true,
            bridge_port: 47631,
            track_self: false,
            focus_minutes: 50,
            track_background_audio: true,
            language: "auto".into(),
            style: "chronograph".into(),
            corners: "rounded".into(),
            ui_scale: 100,
            font: "grotesk".into(),
            reduce_motion: false,
            track_calls: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exe_normalisation() {
        assert_eq!(normalize_exe(r"C:\Program Files\Mozilla Firefox\firefox.exe"), "firefox");
        assert_eq!(normalize_exe("/usr/lib/firefox/firefox-bin"), "firefox");
        assert_eq!(normalize_exe("/nix/store/x/bin/.firefox-wrapped"), "firefox");
        assert_eq!(normalize_exe("/usr/bin/python3.12"), "python3");
        assert_eq!(normalize_exe("/usr/lib/electron34/electron"), "electron");
        assert_eq!(normalize_exe(r"C:\Windows\System32\WindowsTerminal.exe"), "windowsterminal");
        assert_eq!(normalize_exe(r"D:\Epic\Fortnite\FortniteClient-Win64-Shipping.exe"), "fortniteclient");
        assert_eq!(normalize_exe(r"C:\Program Files\Unity Hub\Unity Hub.exe"), "unity hub");
    }

    #[test]
    fn generic_host_uses_class() {
        let w = RawWindow {
            title: "main.rs - ZTally - Visual Studio Code".into(),
            exe: Some("/usr/lib/electron34/electron".into()),
            class: Some("Code".into()),
            pid: Some(1),
        };
        let i = w.into_info().unwrap();
        assert_eq!(i.app_key, "code");
        assert_eq!(i.display, "VS Code");
    }

    #[test]
    fn reverse_dns_class() {
        let w = RawWindow { title: "x".into(), exe: None, class: Some("org.mozilla.firefox".into()), pid: None };
        assert_eq!(w.into_info().unwrap().app_key, "firefox");
    }

    #[test]
    fn class_suffixes_are_normalised() {
        assert_eq!(normalize_class("notepad.exe"), "notepad");
        assert_eq!(normalize_class("Vivaldi-stable"), "vivaldi");
        assert_eq!(normalize_class("org.mozilla.firefox"), "firefox");
    }

    #[test]
    fn uwp_host_uses_title() {
        let w = RawWindow { title: "Calculator".into(), exe: Some(r"C:\Windows\System32\ApplicationFrameHost.exe".into()), class: None, pid: None };
        assert_eq!(w.into_info().unwrap().app_key, "calculator");
    }

    #[test]
    fn unknown_app_gets_pretty_name() {
        let w = RawWindow { title: "x".into(), exe: Some("/usr/bin/my-cool_app".into()), class: None, pid: None };
        assert_eq!(w.into_info().unwrap().display, "My Cool App");
    }
}
