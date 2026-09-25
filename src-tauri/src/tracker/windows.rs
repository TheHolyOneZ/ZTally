

use super::{ActiveWindowSource, AudioSource, Backend, BackendInfo, IdleSource, Playing};
use crate::model::RawWindow;
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::SystemInformation::GetTickCount64;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
};

fn window_title(hwnd: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; len as usize + 1];
        let n = GetWindowTextW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }
}

fn process_path(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = vec![0u16; 1024];
        let mut size = buf.len() as u32;
        let res = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut size);
        let _ = CloseHandle(handle);
        res.ok()?;
        Some(String::from_utf16_lossy(&buf[..size as usize]))
    }
}


fn is_lock_screen(path: &str) -> bool {
    let file = path.rsplit(['\\', '/']).next().unwrap_or(path).to_ascii_lowercase();
    matches!(file.as_str(), "lockapp.exe" | "logonui.exe")
}


fn title_app_name(title: &str) -> String {
    title.rsplit(" - ").next().unwrap_or(title).trim().to_string()
}

pub struct WinWindow;

impl ActiveWindowSource for WinWindow {
    fn sample(&mut self) -> Option<RawWindow> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let title = window_title(hwnd);
            let exe = if pid != 0 { process_path(pid) } else { None };
            if exe.as_deref().is_some_and(is_lock_screen) {
                return None;
            }
            if exe.is_none() && title.is_empty() {
                return None;
            }


            let class = exe.is_none().then(|| title_app_name(&title)).filter(|c| !c.is_empty());
            Some(RawWindow { title, exe, class, pid: Some(pid).filter(|p| *p != 0) })
        }
    }
}

pub struct WinIdle;

impl IdleSource for WinIdle {
    fn idle_ms(&mut self) -> Option<u64> {
        unsafe {
            let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
            if !GetLastInputInfo(&mut info).as_bool() {
                return None;
            }

            let now = GetTickCount64() as u32;
            Some(now.wrapping_sub(info.dwTime) as u64)
        }
    }
}


#[derive(Default)]
pub struct MediaSessions {
    manager: Option<windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager>,
    com_ready: bool,
}

impl MediaSessions {
    fn query(&mut self) -> windows::core::Result<Vec<(Playing, bool)>> {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        };
        if self.manager.is_none() {
            self.manager = Some(Manager::RequestAsync()?.join()?);
        }
        let manager = self.manager.as_ref().expect("set above");
        let mut out = vec![];
        for session in manager.GetSessions()? {
            let Ok(info) = session.GetPlaybackInfo() else { continue };
            let playing = info.PlaybackStatus()? == Status::Playing;
            let app = session.SourceAppUserModelId()?.to_string();
            let (title, artist) = if playing {
                match session.TryGetMediaPropertiesAsync().and_then(|op| op.join()) {
                    Ok(p) => (p.Title().map(|t| t.to_string()).unwrap_or_default(), p.Artist().map(|a| a.to_string()).unwrap_or_default()),
                    Err(_) => (String::new(), String::new()),
                }
            } else {
                (String::new(), String::new())
            };
            let title = if artist.is_empty() || title.is_empty() { title } else { format!("{artist} – {title}") };
            out.push((Playing { app, display: None, title, url: None, tab_active: false }, playing));
        }
        Ok(out)
    }

    fn audio_sessions(&mut self) -> windows::core::Result<Vec<Playing>> {
        use windows::core::Interface;
        use windows::Win32::Foundation::S_OK;
        use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
        use windows::Win32::Media::Audio::{
            eConsole, eRender, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
            MMDeviceEnumerator,
        };
        use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
        unsafe {
            if !self.com_ready {

                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                self.com_ready = true;
            }
            let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = devices.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
            let sessions = manager.GetSessionEnumerator()?;
            let own = std::process::id();
            let mut out = vec![];
            for i in 0..sessions.GetCount()? {
                let Ok(ctl) = sessions.GetSession(i) else { continue };
                if ctl.GetState()? != AudioSessionStateActive {
                    continue;
                }
                let Ok(ctl2) = ctl.cast::<IAudioSessionControl2>() else { continue };
                if ctl2.IsSystemSoundsSession() == S_OK {
                    continue;
                }
                let pid = ctl2.GetProcessId().unwrap_or(0);
                if pid == 0 || pid == own {
                    continue;
                }

                if let Ok(meter) = ctl.cast::<IAudioMeterInformation>() {
                    if meter.GetPeakValue().unwrap_or(1.0) < 0.0005 {
                        continue;
                    }
                }
                let Some(path) = process_path(pid) else { continue };
                let file = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string();
                out.push(Playing { app: file, display: None, title: String::new(), url: None, tab_active: false });
            }
            Ok(out)
        }
    }
}

impl MediaSessions {

    fn mic_sessions(&mut self) -> windows::core::Result<Vec<String>> {
        use windows::core::Interface;
        use windows::Win32::Foundation::S_OK;
        use windows::Win32::Media::Audio::{
            eCapture, eCommunications, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
            MMDeviceEnumerator,
        };
        use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
        unsafe {
            if !self.com_ready {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                self.com_ready = true;
            }
            let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

            let device = devices.GetDefaultAudioEndpoint(eCapture, eCommunications)?;
            let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
            let sessions = manager.GetSessionEnumerator()?;
            let own = std::process::id();
            let mut out = vec![];
            for i in 0..sessions.GetCount()? {
                let Ok(ctl) = sessions.GetSession(i) else { continue };
                if ctl.GetState()? != AudioSessionStateActive {
                    continue;
                }
                let Ok(ctl2) = ctl.cast::<IAudioSessionControl2>() else { continue };
                if ctl2.IsSystemSoundsSession() == S_OK {
                    continue;
                }
                let pid = ctl2.GetProcessId().unwrap_or(0);
                if pid == 0 || pid == own {
                    continue;
                }
                let Some(path) = process_path(pid) else { continue };
                out.push(path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string());
            }
            Ok(out)
        }
    }
}

impl AudioSource for MediaSessions {
    fn mics(&mut self) -> Vec<String> {
        self.mic_sessions().unwrap_or_default()
    }

    fn playing(&mut self) -> Vec<Playing> {
        let sessions = self.query().unwrap_or_else(|_| {
            self.manager = None;
            vec![]
        });
        let streams = self.audio_sessions().unwrap_or_default();
        super::merge_audio(sessions, streams)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_screen_and_title_fallback() {
        assert!(is_lock_screen(r"C:\Windows\SystemApps\Microsoft.LockApp_cw5n1h2txyewy\LockApp.exe"));
        assert!(is_lock_screen(r"C:\Windows\System32\LogonUI.exe"));
        assert!(!is_lock_screen(r"C:\Windows\explorer.exe"));
        assert_eq!(title_app_name("Untitled - Notepad"), "Notepad");
        assert_eq!(title_app_name("Task Manager"), "Task Manager");
    }
}

pub fn backend() -> Backend {
    Backend {
        window: Box::new(WinWindow),
        idle: Box::new(WinIdle),
        info: BackendInfo { id: "windows", label: "Windows".into(), ok: true, idle_supported: true, note: None, fix: None },
    }
}
