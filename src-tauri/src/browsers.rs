

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

struct Known {
    id: &'static str,
    name: &'static str,

    family: &'static str,
    ext_page: &'static str,
    #[cfg_attr(windows, allow(dead_code))]
    bins: &'static [&'static str],
    #[cfg_attr(windows, allow(dead_code))]
    flatpak: &'static str,

    #[cfg_attr(not(windows), allow(dead_code))]
    win: &'static [(&'static str, &'static str)],
}

const FIREFOX_PAGE: &str = "about:debugging#/runtime/this-firefox";

const KNOWN: &[Known] = &[
    Known {
        id: "chrome",
        name: "Google Chrome",
        family: "chromium",
        ext_page: "chrome://extensions",
        bins: &["google-chrome-stable", "google-chrome"],
        flatpak: "com.google.Chrome",
        win: &[("ProgramFiles", r"Google\Chrome\Application\chrome.exe"), ("LOCALAPPDATA", r"Google\Chrome\Application\chrome.exe")],
    },
    Known {
        id: "edge",
        name: "Microsoft Edge",
        family: "chromium",
        ext_page: "edge://extensions",
        bins: &["microsoft-edge-stable", "microsoft-edge"],
        flatpak: "com.microsoft.Edge",
        win: &[("ProgramFiles(x86)", r"Microsoft\Edge\Application\msedge.exe"), ("ProgramFiles", r"Microsoft\Edge\Application\msedge.exe")],
    },
    Known {
        id: "brave",
        name: "Brave",
        family: "chromium",
        ext_page: "brave://extensions",
        bins: &["brave-browser", "brave"],
        flatpak: "com.brave.Browser",
        win: &[("ProgramFiles", r"BraveSoftware\Brave-Browser\Application\brave.exe"), ("LOCALAPPDATA", r"BraveSoftware\Brave-Browser\Application\brave.exe")],
    },
    Known {
        id: "vivaldi",
        name: "Vivaldi",
        family: "chromium",
        ext_page: "vivaldi://extensions",
        bins: &["vivaldi-stable", "vivaldi"],
        flatpak: "com.vivaldi.Vivaldi",
        win: &[("LOCALAPPDATA", r"Vivaldi\Application\vivaldi.exe"), ("ProgramFiles", r"Vivaldi\Application\vivaldi.exe")],
    },
    Known {
        id: "opera",
        name: "Opera",
        family: "chromium",
        ext_page: "opera://extensions",
        bins: &["opera"],
        flatpak: "com.opera.Opera",
        win: &[("LOCALAPPDATA", r"Programs\Opera\opera.exe")],
    },
    Known {
        id: "chromium",
        name: "Chromium",
        family: "chromium",
        ext_page: "chrome://extensions",
        bins: &["chromium", "chromium-browser"],
        flatpak: "org.chromium.Chromium",
        win: &[("LOCALAPPDATA", r"Chromium\Application\chrome.exe")],
    },
    Known {
        id: "firefox",
        name: "Firefox",
        family: "firefox",
        ext_page: FIREFOX_PAGE,
        bins: &["firefox"],
        flatpak: "org.mozilla.firefox",
        win: &[("ProgramFiles", r"Mozilla Firefox\firefox.exe"), ("ProgramFiles(x86)", r"Mozilla Firefox\firefox.exe")],
    },
    Known {
        id: "librewolf",
        name: "LibreWolf",
        family: "firefox",
        ext_page: FIREFOX_PAGE,
        bins: &["librewolf"],
        flatpak: "io.gitlab.librewolf-community",
        win: &[("ProgramFiles", r"LibreWolf\librewolf.exe")],
    },
    Known {
        id: "zen",
        name: "Zen",
        family: "firefox",
        ext_page: FIREFOX_PAGE,
        bins: &["zen-browser", "zen"],
        flatpak: "app.zen_browser.zen",
        win: &[("ProgramFiles", r"Zen Browser\zen.exe")],
    },
];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub family: &'static str,
    pub ext_page: &'static str,
}

enum Launcher {
    Exe(PathBuf),
    #[cfg_attr(windows, allow(dead_code))]
    Flatpak(&'static str),
}

#[cfg(not(windows))]
fn find(k: &Known) -> Option<Launcher> {
    let path = std::env::var_os("PATH")?;
    for bin in k.bins {
        if let Some(p) = std::env::split_paths(&path).map(|d| d.join(bin)).find(|p| p.is_file()) {
            return Some(Launcher::Exe(p));
        }
    }
    let home = dirs::home_dir().unwrap_or_default();
    let installed = [PathBuf::from("/var/lib/flatpak/app"), home.join(".local/share/flatpak/app")]
        .iter()
        .any(|d| d.join(k.flatpak).exists());
    installed.then_some(Launcher::Flatpak(k.flatpak))
}

#[cfg(windows)]
fn find(k: &Known) -> Option<Launcher> {
    k.win
        .iter()
        .filter_map(|(var, rel)| std::env::var_os(var).map(|base| PathBuf::from(base).join(rel)))
        .find(|p| p.is_file())
        .map(Launcher::Exe)
}

pub fn detect() -> Vec<BrowserInfo> {
    KNOWN
        .iter()
        .filter(|k| find(k).is_some())
        .map(|k| BrowserInfo { id: k.id, name: k.name, family: k.family, ext_page: k.ext_page })
        .collect()
}


pub fn open_extension_page(id: &str) -> Result<bool, String> {
    let k = KNOWN.iter().find(|k| k.id == id).ok_or("unknown browser")?;
    let mut cmd = match find(k).ok_or("browser not found")? {
        Launcher::Exe(p) => Command::new(p),
        Launcher::Flatpak(app) => {
            let mut c = Command::new("flatpak");
            c.args(["run", app]);
            c
        }
    };
    let direct = k.family == "firefox";
    if direct {
        cmd.arg(k.ext_page);
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(direct)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_pages_match_family() {
        let mut ids: Vec<_> = KNOWN.iter().map(|k| k.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), KNOWN.len());
        for k in KNOWN {
            assert_eq!(k.family == "firefox", k.ext_page == FIREFOX_PAGE, "{}", k.id);
        }
    }
}

#[cfg(test)]
mod live {

    #[test]
    #[ignore]
    fn detect_live() {
        for b in super::detect() {
            println!("{} ({}) -> {}", b.name, b.family, b.ext_page);
        }
    }
}
