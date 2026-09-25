<div align="center">

<img src="ztally/assets/img/logo-512.webp" width="96" height="96" alt="ZTally logo" />

# ZTally

**Where did the day go?**<br />
A free, private screen-time tracker for Windows and Linux. Nothing leaves your computer.

[![Version](https://img.shields.io/badge/version-0.1.0-f0a948?style=flat-square)](https://zsync.eu/ztally/#download)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-26231c?style=flat-square)](#platform-support)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-26231c?style=flat-square)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20Rust-26231c?style=flat-square)](https://tauri.app)
[![Offline](https://img.shields.io/badge/network-none-7fc98d?style=flat-square)](#privacy)

[**Website**](https://zsync.eu/ztally/) · [**Download**](https://zsync.eu/ztally/#download) · [Features](#features) · [Privacy](#privacy) · [Building](#building)

<br />

<img src="ztally/assets/img/app-today.webp" width="880" alt="ZTally's Dial: today's app use painted around a 24-hour ring, with apps and their categories listed on the right" />

</div>

<br />

ZTally sits in the tray, notes which window has focus once a second, and shows where your day went: a 24-hour **dial**, a weekly **ribbon**, a month and year **calendar**, and printable **receipts**. It sorts everything into categories on its own, tells focus from drift, and keeps it all in one local SQLite file. There's no account, no cloud and no telemetry.

## Download

<table>
  <tr>
    <th align="left">Windows 10 / 11</th>
    <th align="left">Linux (x86_64, glibc 2.35+)</th>
    <th align="left">Browser extension <sup>optional</sup></th>
  </tr>
  <tr valign="top">
    <td>
      <a href="https://zsync.eu/ztally/releases/latest/windows"><b>Installer (.exe)</b></a><br />
      <sub>Per user, no admin rights. Installs WebView2 if missing.</sub>
    </td>
    <td>
      <a href="https://zsync.eu/ztally/releases/latest/deb"><b>.deb</b></a> ·
      <a href="https://zsync.eu/ztally/releases/latest/rpm"><b>.rpm</b></a> ·
      <a href="https://zsync.eu/ztally/releases/latest/appimage"><b>AppImage</b></a><br />
      <sub>Ubuntu 22.04, Debian 12, Fedora 36 and newer.</sub>
    </td>
    <td>
      <a href="https://zsync.eu/ztally/releases/latest/extension"><b>ZTally Bridge (.zip)</b></a><br />
      <sub>Chrome, Edge, Brave, Vivaldi, Opera, Firefox.</sub>
    </td>
  </tr>
</table>

```sh
sudo apt install ./ZTally_0.1.0_amd64.deb        # Debian, Ubuntu, Mint, Pop!_OS
sudo dnf install ./ZTally-0.1.0-1.x86_64.rpm     # Fedora, RHEL-likes
```

Checksums: [`SHA256SUMS`](https://zsync.eu/ztally/releases/latest/checksums). All builds are also on the [GitHub releases](https://github.com/TheHolyOneZ/ZTally/releases) page.

> [!NOTE]
> The Windows installer isn't code-signed yet, so SmartScreen may show "unknown publisher". Choose **More info → Run anyway**, or check the file against `SHA256SUMS` first.

## Features

<table>
  <tr valign="top">
    <td width="50%">
      <h3>The Dial</h3>
      Today as a 24-hour ring. Each minute is painted in its category's colour; away time is hatched; amber arcs mark your longest focus streak and focus sessions. Hover or use the arrow keys to see exactly what was in front of you.
    </td>
    <td width="50%">
      <h3>Background audio &amp; calls</h3>
      Spotify behind your editor, a YouTube tab in another window, a Discord call during a game: recorded separately with what you did meanwhile, and <b>never</b> added to screen time. When an app uses your mic, that's a call, even in the foreground.
    </td>
  </tr>
</table>

<p align="center">
  <img src="ztally/assets/img/app-background.webp" width="880" alt="Hover card showing VS Code in front while a YouTube tab played; the side panel lists calls and background audio" />
</p>

| | |
|---|---|
| **Passive** | No timers to start. Idle and away time are detected automatically; a video, call or game making sound in front of you doesn't count as away. The lock screen never counts. |
| **Automatic categories** | Hundreds of built-in rules for apps and sites. Right-click or drag anything onto a category to refile it, and past time repaints instantly. |
| **Sites, not just "Browser"** | Read from tab titles out of the box, or exact domains with the optional *ZTally Bridge* extension. |
| **Focus sessions** | 25, 50 or 90 minutes from the dial, the tray or <kbd>Ctrl</kbd>+<kbd>K</kbd>. A minute in a drift app (social, entertainment, games) earns a nudge; the end brings a report: % on task, what you worked in, what pulled you away. |
| **Goals** | Budgets ("at most 45m of Social a day") and targets ("at least 4h of Deep Work") with progress rings and notifications. |
| **Receipts & export** | A day, week, month or hand-picked days, itemised like a till slip. Save as PNG, print, or export CSV and JSON. |
| **Doesn't count itself** | Time spent looking at ZTally isn't tracked (toggle in Settings). |
| **Yours to shape** | 5 styles (Chronograph, Nocturne, Verdant, Rosé, Graphite), each dark and light; sharp or round corners, 3 fonts, interface size, reduced motion. |
| **6 languages** | English, Deutsch, Español, Français, Português (Brasil), 日本語, plus any language you add by dropping a JSON file in. |
| **Small** | ~8 MB native binary (Tauri + Rust), ~4 MB `.deb`. Closing the window frees the webview; only the tray and tracker keep running. |

## Views

<table>
  <tr>
    <td width="50%"><img src="ztally/assets/img/app-week.webp" alt="The Ribbon: seven days as hour cells coloured by category" /></td>
    <td width="50%"><img src="ztally/assets/img/app-calendar.webp" alt="Month calendar with each day's total and category mix" /></td>
  </tr>
  <tr>
    <td><b>Ribbon</b>: the week as 7×24 hour cells, with category totals against last week.</td>
    <td><b>Calendar</b>: a month grid with each day's mix. Click any day to open its dial.</td>
  </tr>
  <tr>
    <td><img src="ztally/assets/img/app-receipt.webp" alt="A weekly screen-time receipt itemised by category" /></td>
    <td><img src="ztally/assets/img/app-goals.webp" alt="Goals with progress rings" /></td>
  </tr>
  <tr>
    <td><b>Receipt</b>: any period itemised like a till slip. Click days, shift-click for a range.</td>
    <td><b>Goals</b>: a sentence-style goal builder and live progress rings.</td>
  </tr>
</table>

<details>
<summary><b>More screenshots</b>: year heatmap, command palette, focus, styles, settings</summary>
<br />

| Year | Command palette |
|---|---|
| <img src="ztally/assets/img/app-year.webp" alt="Year heatmap" /> | <img src="ztally/assets/img/app-palette.webp" alt="Command palette" /> |
| **Start focus** | **Settings** |
| <img src="ztally/assets/img/app-focuspick.webp" alt="Starting a focus session from the dial" /> | <img src="ztally/assets/img/app-settings.webp" alt="Appearance settings" /> |
| **Nocturne** | **Rosé, light** |
| <img src="ztally/assets/img/app-nocturne.webp" alt="Nocturne style" /> | <img src="ztally/assets/img/app-rose-light.webp" alt="Rosé style, light theme" /> |

</details>

Also: a **Categories** view with a "sort inbox" of uncategorised apps and sites, a category editor and rules. New users get a short setup (language, privacy, style, extension) and an optional **interactive tour** that spotlights the real UI; some steps only continue once you've tried the thing. Replay it from Settings or the palette.

**Shortcuts:** <kbd>Ctrl</kbd>+<kbd>K</kbd> command palette · <kbd>←</kbd> / <kbd>→</kbd> previous / next day or week · <kbd>T</kbd> today · <kbd>1</kbd>–<kbd>7</kbd> views. Hover the sidebar for labels; the window has its own titlebar (drag it, double-click to maximise).

## Privacy

- **No network.** No account, cloud sync, telemetry or update checks. The only listener is the optional extension bridge on `127.0.0.1:47631`, which only accepts browser extensions.
- **Audio is never recorded.** Call detection only notices *that* an app uses the microphone.
- **Titles are optional.** Turn window titles off entirely or per app (password managers are excluded by default). Private/incognito windows never store titles or domains.
- **Yours to delete.** Ignore any app completely; forget the last hour, today, 7 days, chosen days, one app's history or everything; or reset the app.
- **Data location:** `~/.local/share/ztally/ztally.db` on Linux, `%LOCALAPPDATA%\ztally\ztally.db` on Windows.

## Platform support

| Session | How the focused window is read | Idle detection |
|---|---|---|
| Windows 10/11 | `GetForegroundWindow` + `QueryFullProcessImageNameW` | `GetLastInputInfo` |
| X11 (any desktop) | EWMH `_NET_ACTIVE_WINDOW` | XScreenSaver extension |
| KDE Plasma (Wayland) | a bundled KWin script, loaded automatically | `org.freedesktop.ScreenSaver` |
| GNOME (Wayland) · *experimental* | a small bundled Shell extension (one-click install, then log out/in) | Mutter IdleMonitor |
| Sway · *experimental* | i3-compatible IPC | logind idle hint (needs swayidle) |
| Hyprland · *experimental* | Hyprland IPC socket | logind idle hint (needs hypridle) |

| Audio source | Linux | Windows |
|---|---|---|
| Media players (title, paused state) | MPRIS | System media controls (GSMTC) |
| Anything making sound | `pactl` sink inputs | WASAPI audio sessions with peak meter |
| Microphone in use (calls) | `pactl` source outputs | WASAPI capture sessions |

On Linux, `pactl` comes from `pulseaudio-utils` on most distros and is also needed with PipeWire. Without it, ZTally falls back to MPRIS media players only and can't detect calls.

Other Wayland compositors don't expose the focused window, and ZTally says so instead of guessing. The *experimental* backends are implemented and unit-tested but haven't had much real-world use yet. Reports are welcome.

<details>
<summary><b>Browser extension (optional)</b></summary>
<br />

Settings → Browser → **Set up extension** (also in onboarding and <kbd>Ctrl</kbd>+<kbd>K</kbd>) opens a guided setup:

- It detects installed browsers (Chrome, Edge, Brave, Vivaldi, Opera, Chromium, Firefox, LibreWolf, Zen; native, Flatpak or Windows installs) and shows the steps for the one you pick, with a sketch of what to click.
- It writes the extension to your data folder and copies the folder path and extension-page address for you. Firefox opens straight onto `about:debugging`. Chromium browsers refuse `chrome://` addresses from outside apps, so ZTally opens the browser and you paste the address.
- A live indicator turns green as soon as the extension first reports, and says which browser family it came from.

With the extension, ZTally also sees which tabs are playing sound, so a YouTube tab playing in the background is told apart from the tab in front.

Browsers don't let apps install extensions silently, so the last click is always yours: **Load unpacked** (Chromium, with Developer mode) or **Load Temporary Add-on** (Firefox). Firefox drops temporary add-ons on restart; a permanent Firefox install needs the extension signed by Mozilla (addons.mozilla.org, free for unlisted add-ons).

</details>

<details>
<summary><b>Rules &amp; categories</b></summary>
<br />

Rules match an **app** (normalised executable name, e.g. `code`, `firefox`), a **site** (domain, including subdomains), or a **window title** (regex or plain text). The most specific match wins: site, then title, then app. Among rules of the same kind, your own rules beat the built-ins. So filing *Firefox* under "General" never swallows YouTube or GitHub.

Each category counts as **focus**, **neutral** or **drift**, and you can change that per category.

</details>

<details>
<summary><b>Adding a language</b></summary>
<br />

Every UI string lives in `src/locales/<code>.json` (nested keys, `{placeholders}`, plural forms as `key_one` / `key_other` following `Intl.PluralRules`). To add a language:

1. Copy `src/locales/en.json` to e.g. `src/locales/it.json` and set `_meta.name` (`"Italiano"`) and `_meta.english` (`"Italian"`).
2. Translate the values. Missing keys fall back to English, so partial files work.
3. `pnpm check:locales` checks for missing or unknown keys and mismatched placeholders.
4. Rebuild. The language shows up in Settings → Appearance automatically, and the tray menu and notifications use it too (the Rust side embeds the same files via `build.rs`).

"Match system" picks the best file for the OS locale (`pt-PT` → `pt-BR`, `de-AT` → `de`) and formats dates with your regional variant (e.g. `en-GB` keeps 24-hour clocks).

</details>

<details>
<summary><b>Adding a style</b></summary>
<br />

Styles live in `src/styles/styles.css` (surfaces and accent for dark and light) and are listed in `src/lib/styles.ts`. Category colours are shared by every style and were checked for colour-blind separation and contrast against each style's surfaces.

</details>

## Building

Requirements: Rust (stable), Node 20+, pnpm, and on Linux the Tauri prerequisites (`webkit2gtk-4.1`, `libayatana-appindicator`, `libxss`).

```sh
pnpm install
pnpm tauri dev                # run
pnpm tauri build              # release bundles (AppImage/deb/rpm on Linux, NSIS/MSI on Windows)
cd src-tauri && cargo test    # engine, classifier, reports, parsers
```

Useful environment variables: `ZTALLY_DATA_DIR` (use a different database folder) and `ZTALLY_BACKEND` (force `x11`, `kwin`, `gnome`, `sway` or `hyprland`). `cargo test live_sample -- --ignored --nocapture` prints what the detected backend sees right now, including playing audio and active microphones.

<details>
<summary><b>Releases</b></summary>
<br />

Push a version tag and GitHub Actions does the rest (`.github/workflows/release.yml`):

```sh
# bump "version" in src-tauri/tauri.conf.json first; the workflow checks the tag matches
git tag v0.1.0 && git push origin v0.1.0
```

It builds the Linux packages (`.deb`, `.rpm`, `.AppImage`) on Ubuntu 22.04, so they run on anything with glibc 2.35 or newer, and the Windows NSIS installer (per-user, no admin rights; installs WebView2 when missing). It runs the frontend checks and all engine tests on both systems, zips the browser extension, and publishes everything with `SHA256SUMS` as a draft release.

To update the website, upload the release files to `ztally/releases/` and set `ZTALLY_VERSION` in `ztally/releases/.htaccess`. The `releases/latest/*` links on the site follow it.

Local builds work too (`pnpm tauri build`). On Arch-based systems set `NO_STRIP=true` for the AppImage; the result then needs the build machine's glibc or newer.

</details>

<details>
<summary><b>Code layout</b></summary>
<br />

```
src-tauri/src/
  tracker/mod.rs     platform-neutral engine: sampling, heartbeat merge, idle, audio, calls
  tracker/*.rs       one small backend per platform (x11, kwin, gnome, sway, hyprland, windows, pulse)
  browser.rs         title → site parsing, extension bridge
  classify.rs        rule engine
  report.rs          day/range aggregation, focus streaks, background & calls, goals, export
  db/                SQLite schema & queries
src/                 React UI (views/, components/, lib/, locales/)
extension/           ZTally Bridge WebExtension (MV3, Chromium + Firefox)
ztally/              the website at zsync.eu/ztally/
```

Only `tracker/windows.rs` is Windows-specific; everything else, including the UI, is shared.

</details>

<details>
<summary><b>Checking the Windows build from Linux</b></summary>
<br />

```sh
rustup target add x86_64-pc-windows-gnu          # plus mingw-w64-gcc
cd src-tauri
cargo check --target x86_64-pc-windows-gnu
cargo test  --target x86_64-pc-windows-gnu --no-run
wine target/x86_64-pc-windows-gnu/debug/deps/ztally_lib-*.exe   # full unit suite
```

The foreground/idle backend can be smoke-tested under Wine with `live_sample` (open e.g. `wine notepad` first). A real Windows 10/11 run is still the final check for WebView2, the tray and audio sessions.

</details>

## License

© 2026 [TheHolyOneZ](https://github.com/TheHolyOneZ) · [zsync.eu](https://zsync.eu/ztally/)<br />
GNU General Public License v3.0 only. See [LICENSE](LICENSE).
