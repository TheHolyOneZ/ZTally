

use parking_lot::Mutex;
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};

pub const BROWSERS: &[&str] = &[
    "firefox", "firefox-esr", "librewolf", "waterfox", "floorp", "zen", "chrome", "google-chrome", "chromium",
    "brave", "brave-browser", "msedge", "microsoft-edge", "vivaldi", "opera", "epiphany", "thorium", "mullvad-browser",
    "tor-browser", "yandex", "arc", "min", "qutebrowser", "falkon", "midori", "helium",
];

pub fn is_browser(app_key: &str) -> bool {
    BROWSERS.contains(&app_key)
}


const BROWSER_SUFFIXES: &[&str] = &[
    "Mozilla Firefox Private Browsing", "Mozilla Firefox", "Firefox Developer Edition", "Firefox Nightly",
    "Google Chrome", "Chromium", "Brave", "Microsoft Edge", "Microsoft\u{200b} Edge", "Vivaldi", "Opera",
    "LibreWolf", "Waterfox", "Floorp", "Zen Browser", "Zen", "Tor Browser", "Mullvad Browser", "Thorium",
    "qutebrowser", "Falkon", "Helium",
];


const TITLE_BRANDS: &[(&str, &str)] = &[
    ("YouTube", "youtube.com"),
    ("YouTube Music", "music.youtube.com"),
    ("GitHub", "github.com"),
    ("GitLab", "gitlab.com"),
    ("Reddit", "reddit.com"),
    ("Stack Overflow", "stackoverflow.com"),
    ("Wikipedia", "wikipedia.org"),
    ("Netflix", "netflix.com"),
    ("Twitch", "twitch.tv"),
    ("X", "x.com"),
    ("Twitter", "twitter.com"),
    ("Facebook", "facebook.com"),
    ("Instagram", "instagram.com"),
    ("LinkedIn", "linkedin.com"),
    ("TikTok", "tiktok.com"),
    ("Gmail", "mail.google.com"),
    ("Google Docs", "docs.google.com"),
    ("Google Sheets", "sheets.google.com"),
    ("Google Search", "google.com"),
    ("Google Drive", "drive.google.com"),
    ("Google Meet", "meet.google.com"),
    ("Google Calendar", "calendar.google.com"),
    ("Outlook", "outlook.office.com"),
    ("Discord", "discord.com"),
    ("Slack", "app.slack.com"),
    ("WhatsApp", "web.whatsapp.com"),
    ("Notion", "notion.so"),
    ("Figma", "figma.com"),
    ("Spotify", "open.spotify.com"),
    ("Prime Video", "primevideo.com"),
    ("Disney+", "disneyplus.com"),
    ("Amazon.com", "amazon.com"),
    ("ChatGPT", "chatgpt.com"),
    ("Claude", "claude.ai"),
    ("MDN", "developer.mozilla.org"),
    ("MDN Web Docs", "developer.mozilla.org"),
    ("Docs.rs", "docs.rs"),
    ("crates.io: Rust Package Registry", "crates.io"),
    ("npm", "npmjs.com"),
    ("Hacker News", "news.ycombinator.com"),
    ("Bluesky", "bsky.app"),
    ("Mastodon", "mastodon.social"),
    ("Pinterest", "pinterest.com"),
    ("Coursera", "coursera.org"),
    ("Udemy", "udemy.com"),
    ("Duolingo", "duolingo.com"),
    ("DuckDuckGo", "duckduckgo.com"),
    ("Chess.com", "chess.com"),
    ("lichess.org", "lichess.org"),
    ("Steam", "store.steampowered.com"),
    ("Twitch", "twitch.tv"),
    ("Crunchyroll", "crunchyroll.com"),
    ("SoundCloud", "soundcloud.com"),
    ("Medium", "medium.com"),
    ("Overleaf", "overleaf.com"),
    ("Trello", "trello.com"),
    ("Jira", "atlassian.net"),
    ("Confluence", "atlassian.net"),
    ("Canva", "canva.com"),
    ("Microsoft Teams", "teams.microsoft.com"),
];

const SEPARATORS: &[&str] = &[" — ", " – ", " - ", " | ", " · ", " • ", " :: ", " / "];


pub fn strip_browser_suffix(title: &str) -> &str {
    let mut t = title.trim();

    for sep in SEPARATORS {
        for name in BROWSER_SUFFIXES {
            if let Some(rest) = t.strip_suffix(name).and_then(|r| r.strip_suffix(sep)) {
                t = rest.trim_end();
            }
        }
    }
    t
}

fn tld_ok(tld: &str) -> bool {
    matches!(
        tld,
        "com" | "org" | "net" | "io" | "dev" | "app" | "ai" | "co" | "tv" | "gg" | "me" | "so" | "sh" | "rs" | "de"
            | "uk" | "fr" | "nl" | "eu" | "info" | "xyz" | "edu" | "gov" | "us" | "ca" | "jp" | "ru" | "it" | "es"
            | "pl" | "ch" | "at" | "se" | "no" | "fi" | "dk" | "be" | "br" | "in" | "au" | "cc" | "fm" | "ly" | "page"
            | "site" | "tech" | "cloud" | "social" | "news" | "wiki" | "blog" | "online" | "store" | "games"
    )
}


fn find_hostname(text: &str) -> Option<String> {
    for raw in text.split(|c: char| c.is_whitespace() || matches!(c, '(' | ')' | '[' | ']' | '"' | '\'' | ',' | '|')) {
        let w = raw.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
        let w = w.strip_prefix("https://").or_else(|| w.strip_prefix("http://")).unwrap_or(&w);
        let host = w.split('/').next().unwrap_or(w);
        let host = host.strip_prefix("www.").unwrap_or(host);
        let parts: Vec<&str> = host.split('.').collect();
        if parts.len() >= 2
            && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
            && tld_ok(parts[parts.len() - 1])
            && parts[parts.len() - 2].chars().any(|c| c.is_ascii_alphabetic())
        {
            return Some(host.to_string());
        }
    }
    None
}


pub fn domain_from_title(title: &str) -> Option<String> {
    let page = strip_browser_suffix(title);
    if page.is_empty() {
        return None;
    }


    let mut segments: Vec<&str> = vec![page];
    for sep in SEPARATORS {
        if page.contains(sep) {
            segments = page.split(sep).map(str::trim).collect();
            break;
        }
    }
    let last = segments.last().copied().unwrap_or(page);
    let first = segments.first().copied().unwrap_or(page);
    for cand in [last, first] {
        let c = cand.trim_start_matches(|ch: char| ch == '(' || ch.is_ascii_digit() || ch == ')' || ch == ' ');
        if let Some((_, d)) = TITLE_BRANDS.iter().find(|(b, _)| b.eq_ignore_ascii_case(c)) {
            return Some((*d).to_string());
        }
    }

    if let Some(first) = segments.first() {
        let head = first.split(": ").next().unwrap_or(first);
        let parts: Vec<&str> = head.split('/').collect();
        let ident = |p: &str| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
        if parts.len() == 2 && parts.iter().all(|p| ident(p)) && (first.contains(": ") || segments.len() == 1)
            && !head.contains('.')
            && !matches!(parts[0], "r" | "u" | "user")
        {
            return Some("github.com".into());
        }
    }

    if segments.iter().any(|s| s.starts_with("r/")) {
        return Some("reddit.com".into());
    }

    if page.contains("localhost") || page.contains("127.0.0.1") {
        return Some("localhost".into());
    }
    find_hostname(last).or_else(|| find_hostname(page))
}


pub fn domain_from_url(url: &str) -> Option<String> {
    let rest = url.split_once("://")?;
    match rest.0 {
        "http" | "https" => {}
        "file" => return Some("local file".into()),
        _ => return None,
    }
    let host = rest.1.split(['/', '?', '#']).next()?;
    let host = host.rsplit('@').next()?;
    let host = if host.starts_with('[') { host } else { host.split(':').next()? };
    let host = host.strip_prefix("www.").unwrap_or(host).to_lowercase();
    if host == "127.0.0.1" || host == "[::1]" {
        return Some("localhost".into());
    }
    if host.is_empty() { None } else { Some(host) }
}


#[derive(Deserialize, Debug, Clone)]
pub struct TabReport {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub browser: String,
    #[serde(default)]
    pub audible: bool,
    #[serde(default)]
    pub incognito: bool,

    #[serde(default, rename = "audibleTabs")]
    pub audible_tabs: Vec<AudibleTab>,
}

#[derive(Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AudibleTab {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub incognito: bool,

    #[serde(default)]
    pub active: bool,
}

pub fn is_firefox_family(app_key: &str) -> bool {
    matches!(app_key, "firefox" | "librewolf" | "waterfox" | "floorp" | "zen" | "tor-browser" | "mullvad-browser" | "firefox-developer-edition")
}

#[derive(Default)]
struct BridgeInner {
    last: Option<(TabReport, Instant)>,
    last_contact: Option<Instant>,

    last_browser: Option<String>,

    audible: Option<(Vec<AudibleTab>, Instant)>,
}

#[derive(Clone, Default)]
pub struct Bridge(Arc<Mutex<BridgeInner>>);

pub struct TabMatch {
    pub domain: Option<String>,
    pub audible: bool,
    pub incognito: bool,
}


fn loose(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).take(60).collect()
}

impl Bridge {
    pub fn connected(&self) -> bool {
        self.0.lock().last_contact.is_some_and(|t| t.elapsed() < Duration::from_secs(90))
    }

    pub fn record(&self, tab: TabReport) {
        let mut g = self.0.lock();
        let now = Instant::now();
        if !tab.browser.is_empty() {
            g.last_browser = Some(tab.browser.clone());
        }
        g.audible = Some((tab.audible_tabs.clone(), now));

        if !tab.url.is_empty() {
            g.last = Some((tab, now));
        }
        g.last_contact = Some(now);
    }


    pub fn audible_tabs(&self) -> Option<(Vec<AudibleTab>, String)> {
        let g = self.0.lock();
        let (tabs, at) = g.audible.as_ref()?;
        (at.elapsed() < Duration::from_secs(45)).then(|| (tabs.clone(), g.last_browser.clone().unwrap_or_default()))
    }


    pub fn connected_browser(&self) -> Option<String> {
        if !self.connected() {
            return None;
        }
        self.0.lock().last_browser.clone()
    }

    pub fn ping(&self) {
        self.0.lock().last_contact = Some(Instant::now());
    }


    pub fn match_window(&self, window_title: &str) -> Option<TabMatch> {
        let g = self.0.lock();
        let (tab, at) = g.last.as_ref()?;
        if at.elapsed() > Duration::from_secs(120) {
            return None;
        }
        let page = loose(strip_browser_suffix(window_title));
        let tab_title = loose(&tab.title);
        let matches = !tab_title.is_empty() && (page.starts_with(&tab_title) || tab_title.starts_with(&page));
        if !matches {
            return None;
        }
        Some(TabMatch { domain: domain_from_url(&tab.url), audible: tab.audible, incognito: tab.incognito })
    }
}

fn origin_allowed(origin: Option<&str>) -> bool {
    match origin {

        Some(o) => o.starts_with("moz-extension://") || o.starts_with("chrome-extension://") || o.starts_with("extension://"),

        None => false,
    }
}


pub fn spawn_bridge(bridge: Bridge, port: u16) {
    std::thread::Builder::new()
        .name("ztally-bridge".into())
        .spawn(move || {
            let server = match tiny_http::Server::http(("127.0.0.1", port)) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[ztally] browser bridge disabled: cannot bind 127.0.0.1:{port}: {e}");
                    return;
                }
            };
            for mut req in server.incoming_requests() {
                let header = |name: &str| {
                    req.headers()
                        .iter()
                        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
                        .map(|h| h.value.as_str().to_string())
                };
                let origin = header("Origin");
                let has_marker = header("X-ZTally").is_some();


                let ok_origin = origin_allowed(origin.as_deref())
                    || (has_marker && origin.as_deref().is_none_or(|o| o == "null"));
                let method = req.method().clone();
                let url = req.url().to_string();

                let status = if !ok_origin {
                    403
                } else if method == tiny_http::Method::Options {
                    204
                } else if method == tiny_http::Method::Get && url == "/v1/ping" {
                    bridge.ping();
                    200
                } else if method == tiny_http::Method::Post && url == "/v1/tab" {
                    let mut body = String::new();
                    let _ = std::io::Read::take(req.as_reader(), 64 * 1024).read_to_string(&mut body);
                    match serde_json::from_str::<TabReport>(&body) {
                        Ok(tab) => {
                            bridge.record(tab);
                            204
                        }
                        Err(_) => 400,
                    }
                } else {
                    404
                };

                let mut resp = tiny_http::Response::from_string(if status == 200 { "{\"app\":\"ztally\"}" } else { "" })
                    .with_status_code(status);
                if ok_origin {
                    if let Some(o) = origin.filter(|o| o != "null") {
                        if let Ok(h) = tiny_http::Header::from_bytes("Access-Control-Allow-Origin", o.as_bytes()) {
                            resp.add_header(h);
                        }
                    }
                    for (k, v) in [
                        ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
                        ("Access-Control-Allow-Headers", "Content-Type, X-ZTally"),
                    ] {
                        if let Ok(h) = tiny_http::Header::from_bytes(k, v) {
                            resp.add_header(h);
                        }
                    }
                }
                let _ = req.respond(resp);
            }
        })
        .ok();
}

use std::io::Read as _;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_suffixes() {
        assert_eq!(strip_browser_suffix("Rust Docs — Mozilla Firefox"), "Rust Docs");
        assert_eq!(strip_browser_suffix("Inbox - Google Chrome"), "Inbox");
        assert_eq!(strip_browser_suffix("New tab - Work - Microsoft\u{200b} Edge"), "New tab - Work");
    }

    #[test]
    fn title_domains() {
        assert_eq!(domain_from_title("(3) Never Gonna Give You Up - YouTube — Mozilla Firefox").as_deref(), Some("youtube.com"));
        assert_eq!(domain_from_title("tauri-apps/tauri: Build smaller apps - GitHub - Google Chrome").as_deref(), Some("github.com"));
        assert_eq!(domain_from_title("Inbox (4) - me@example.com - Gmail - Mozilla Firefox").as_deref(), Some("mail.google.com"));
        assert_eq!(domain_from_title("r/rust - Mozilla Firefox").as_deref(), Some("reddit.com"));
        assert_eq!(domain_from_title("Vite + React - localhost:5173 — Mozilla Firefox").as_deref(), Some("localhost"));
        assert_eq!(domain_from_title("Welcome — example.org — Mozilla Firefox").as_deref(), Some("example.org"));
        assert_eq!(domain_from_title("Some random page — Mozilla Firefox"), None);
        assert_eq!(domain_from_title("TheHolyOneZ/BackgroundClicker: Tired of automation - Vivaldi").as_deref(), Some("github.com"));
        assert_eq!(domain_from_title("Traffic · TheHolyOneZ/ZVideoConverter - Vivaldi").as_deref(), None);
        assert_eq!(domain_from_title("Home / X - Google Chrome").as_deref(), Some("x.com"));
    }

    #[test]
    fn url_domains() {
        assert_eq!(domain_from_url("https://www.youtube.com/watch?v=x").as_deref(), Some("youtube.com"));
        assert_eq!(domain_from_url("http://localhost:5173/").as_deref(), Some("localhost"));
        assert_eq!(domain_from_url("https://user:pw@git.example.org:8443/a").as_deref(), Some("git.example.org"));
        assert_eq!(domain_from_url("about:newtab"), None);
        assert_eq!(domain_from_url("chrome://settings"), None);
    }

    #[test]
    fn bridge_matches_by_title() {
        let b = Bridge::default();
        b.record(TabReport {
            url: "https://news.ycombinator.com/".into(),
            title: "Hacker News".into(),
            browser: "firefox".into(),
            audible: false,
            incognito: false,
            audible_tabs: vec![],
        });
        let m = b.match_window("Hacker News — Mozilla Firefox").unwrap();
        assert_eq!(m.domain.as_deref(), Some("news.ycombinator.com"));
        assert!(b.match_window("Something else — Mozilla Firefox").is_none());
    }

    #[test]
    fn origins() {
        assert!(origin_allowed(Some("moz-extension://abc")));
        assert!(origin_allowed(Some("chrome-extension://abc")));
        assert!(!origin_allowed(Some("https://evil.example")));
        assert!(!origin_allowed(None));
    }
}
