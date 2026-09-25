

pub const SEED_VERSION: i64 = 3;


pub const CATEGORIES: &[(&str, i64, &str)] = &[
    ("Deep Work", 1, "productive"),
    ("Social", 2, "distracting"),
    ("Learning", 3, "productive"),
    ("Communication", 4, "neutral"),
    ("Entertainment", 5, "distracting"),
    ("Creative", 6, "productive"),
    ("General", 7, "neutral"),
    ("Games", 8, "distracting"),
];


pub const APP_RULES: &[(&str, &[&str])] = &[
    ("Deep Work", &[
        "code", "code-oss", "codium", "vscodium", "cursor", "zed", "zeditor", "idea", "idea64", "pycharm",
        "pycharm64", "clion", "clion64", "webstorm", "webstorm64", "rustrover", "rustrover64", "goland",
        "goland64", "rider", "rider64", "phpstorm", "phpstorm64", "android-studio", "studio64", "devenv",
        "sublime_text", "subl", "vim", "nvim", "gvim", "neovide", "emacs", "kate", "kwrite", "gedit",
        "gnome-text-editor", "notepad++", "notepad", "konsole", "gnome-terminal-server", "kitty",
        "alacritty", "wezterm", "wezterm-gui", "foot", "xterm", "tilix", "terminator", "ghostty",
        "windowsterminal", "cmd", "powershell", "pwsh", "conhost", "libreoffice", "soffice", "winword",
        "excel", "powerpnt", "onenote", "libreoffice-writer", "libreoffice-calc", "libreoffice-impress",
        "libreoffice-draw", "libreoffice-startcenter", "onlyoffice", "desktopeditors", "wps", "zotero7", "obsidian", "logseq", "notion", "joplin", "typora", "postman",
        "insomnia", "dbeaver", "datagrip", "datagrip64", "godot", "unity", "unityhub", "unity hub", "unrealeditor",
        "qtcreator", "kdevelop", "jupyter-lab", "yakuake", "ptyxis", "blackbox", "warp",
    ]),
    ("Learning", &[
        "anki", "zotero", "okular", "evince", "papers", "acrobat", "acrord32", "calibre", "foliate",
        "sumatrapdf", "xournalpp",
    ]),
    ("Communication", &[
        "thunderbird", "betterbird", "outlook", "olk", "evolution", "geary", "kmail", "slack", "teams",
        "ms-teams", "zoom", "skype", "signal", "signal-desktop", "telegram-desktop", "telegram", "element",
        "element-desktop", "whatsapp", "discord", "vesktop", "webcord", "mailspring",
    ]),
    ("Entertainment", &[
        "spotify", "vlc", "mpv", "celluloid", "totem", "haruna", "smplayer", "stremio",
        "jellyfinmediaplayer", "plex", "kodi", "rhythmbox", "elisa", "strawberry", "audacious",
        "clementine", "netflix", "freetube", "tidal-hifi", "mediaplayer", "zunemusic", "zunevideo", "music",
        "amarok", "lollypop", "cider", "youtube-music", "plexamp", "deezer", "shortwave", "g4music",
    ]),
    ("Creative", &[
        "gimp", "gimp-2.10", "gimp-3.0", "krita", "inkscape", "blender", "darktable", "rawtherapee",
        "kdenlive", "shotcut", "openshot", "resolve", "obs", "obs64", "audacity", "ardour", "lmms",
        "reaper", "bitwig-studio", "musescore", "mscore", "mscore4portable", "photoshop", "illustrator",
        "afterfx", "adobe premiere pro", "figma-linux", "figma", "penpot", "freecad", "kicad", "scribus",
        "pixelorama", "aseprite", "affinity", "clipstudiopaint",
    ]),
    ("General", &[
        "firefox", "firefox-esr", "librewolf", "waterfox", "floorp", "zen", "chrome", "google-chrome",
        "chromium", "brave", "msedge", "microsoft-edge", "vivaldi", "opera", "epiphany", "dolphin",
        "nautilus", "thunar", "nemo", "pcmanfm", "pcmanfm-qt", "explorer", "systemsettings",
        "gnome-control-center", "plasmashell", "discover", "pamac-manager", "taskmgr", "ksysguard",
        "plasma-systemmonitor", "gnome-system-monitor", "keepassxc", "bitwarden", "1password", "ark",
        "gwenview", "spectacle", "flameshot", "systemsettings5", "gnome-software", "mintinstall", "ztally",
    ]),
    ("Games", &[
        "steam", "steamwebhelper", "lutris", "heroic", "gamescope", "prismlauncher", "minecraft",
        "retroarch", "dolphin-emu", "pcsx2-qt", "epicgameslauncher", "battle.net", "eadesktop",
        "galaxyclient", "riotclientservices", "leagueclient", "bottles", "itch", "hytalelauncher", "sober",
        "roblox", "robloxplayerbeta", "javaw-minecraft", "osu!", "osu",
    ]),
];

pub const DOMAIN_RULES: &[(&str, &[&str])] = &[
    ("Deep Work", &[
        "github.com", "gitlab.com", "bitbucket.org", "codeberg.org", "docs.google.com", "sheets.google.com",
        "slides.google.com", "notion.so", "linear.app", "atlassian.net", "vercel.com", "netlify.com",
        "localhost", "stackblitz.com", "codesandbox.io", "replit.com", "office.com", "overleaf.com",
        "trello.com", "asana.com", "clickup.com", "cloud.google.com", "console.aws.amazon.com",
        "portal.azure.com", "sourcehut.org",
    ]),
    ("Social", &[
        "reddit.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "tiktok.com", "linkedin.com",
        "threads.net", "bsky.app", "mastodon.social", "tumblr.com", "pinterest.com", "9gag.com",
        "news.ycombinator.com", "quora.com", "snapchat.com", "vk.com",
    ]),
    ("Learning", &[
        "stackoverflow.com", "stackexchange.com", "superuser.com", "askubuntu.com", "serverfault.com",
        "wikipedia.org", "developer.mozilla.org", "docs.rs", "doc.rust-lang.org", "rust-lang.org",
        "crates.io", "npmjs.com", "coursera.org", "udemy.com", "khanacademy.org", "edx.org",
        "duolingo.com", "dev.to", "arxiv.org", "scholar.google.com", "w3schools.com", "learn.microsoft.com",
        "python.org", "readthedocs.io", "chatgpt.com", "claude.ai", "gemini.google.com", "perplexity.ai",
        "archlinux.org", "tauri.app", "react.dev", "typescriptlang.org", "freecodecamp.org",
    ]),
    ("Communication", &[
        "mail.google.com", "outlook.live.com", "outlook.office.com", "web.whatsapp.com", "web.telegram.org",
        "app.slack.com", "teams.microsoft.com", "meet.google.com", "zoom.us", "discord.com", "proton.me",
        "mail.proton.me", "calendar.google.com", "messenger.com",
    ]),
    ("Entertainment", &[
        "youtube.com", "netflix.com", "twitch.tv", "primevideo.com", "disneyplus.com", "hulu.com",
        "spotify.com", "soundcloud.com", "crunchyroll.com", "max.com", "vimeo.com", "dailymotion.com",
        "kick.com", "imdb.com", "letterboxd.com", "bandcamp.com",
    ]),
    ("Creative", &["figma.com", "canva.com", "penpot.app", "excalidraw.com", "dribbble.com", "behance.net"]),
    ("General", &["google.com", "bing.com", "duckduckgo.com", "amazon.com", "ebay.com", "maps.google.com"]),
    ("Games", &[
        "store.steampowered.com", "steamcommunity.com", "chess.com", "lichess.org", "itch.io", "poki.com",
        "crazygames.com", "epicgames.com", "gog.com",
    ]),
];


pub fn display_name(key: &str) -> Option<&'static str> {
    Some(match key {
        "code" | "code-oss" => "VS Code",
        "codium" | "vscodium" => "VSCodium",
        "firefox" | "firefox-esr" => "Firefox",
        "chrome" | "google-chrome" => "Chrome",
        "chromium" => "Chromium",
        "msedge" | "microsoft-edge" => "Edge",
        "brave" => "Brave",
        "librewolf" => "LibreWolf",
        "konsole" => "Konsole",
        "dolphin" => "Dolphin",
        "explorer" => "File Explorer",
        "gnome-terminal-server" => "Terminal",
        "windowsterminal" => "Windows Terminal",
        "idea" | "idea64" => "IntelliJ IDEA",
        "pycharm" | "pycharm64" => "PyCharm",
        "rustrover" | "rustrover64" => "RustRover",
        "sublime_text" => "Sublime Text",
        "soffice" | "libreoffice" => "LibreOffice",
        "winword" => "Word",
        "excel" => "Excel",
        "powerpnt" => "PowerPoint",
        "telegram-desktop" => "Telegram",
        "signal-desktop" => "Signal",
        "steamwebhelper" | "steam" => "Steam",
        "obs" | "obs64" => "OBS Studio",
        "systemsettings" | "systemsettings5" => "System Settings",
        "plasmashell" => "Plasma",
        "devenv" => "Visual Studio",
        "olk" | "outlook" => "Outlook",
        "ms-teams" | "teams" => "Teams",
        "taskmgr" => "Task Manager",
        "notepad++" => "Notepad++",
        "keepassxc" => "KeePassXC",
        "ztally" => "ZTally",
        "prismlauncher" => "Prism Launcher",
        "vivaldi" => "Vivaldi",
        "zunemusic" => "Media Player",
        "libreoffice-writer" => "LibreOffice Writer",
        "libreoffice-calc" => "LibreOffice Calc",
        "libreoffice-impress" => "LibreOffice Impress",
        "spotify" => "Spotify",
        "vlc" => "VLC",
        "mpv" => "mpv",
        "discord" => "Discord",
        _ => return None,
    })
}
