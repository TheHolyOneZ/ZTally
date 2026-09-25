import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { Glyph, Menu, type MenuItem } from "../components/bits";
import { Icon, Logo } from "../components/Icon";
import { ExtensionWizardModal } from "../components/ExtensionWizard";
import { FocusReport } from "../components/FocusReport";
import { Tour } from "../components/Tour";
import { Palette } from "../components/Palette";
import { api } from "../lib/ipc";
import { useT } from "../lib/i18n";
import { tourSignal } from "../lib/tour";
import { useStore, type View } from "../lib/store";
import { addDays, dayBounds, fmtClock, fmtDur, fmtShortDate, isSameDay, relativeDay, startOfWeek } from "../lib/time";
import { Calendar } from "../views/Calendar";
import { Goals } from "../views/Goals";
import { Onboarding } from "../views/Onboarding";
import { Report } from "../views/Report";
import { Rules } from "../views/Rules";
import { Settings } from "../views/Settings";
import { Today } from "../views/Today";
import { Week } from "../views/Week";

const NAV: { view: View; icon: string }[] = [
  { view: "today", icon: "today" },
  { view: "week", icon: "week" },
  { view: "calendar", icon: "calendar" },
  { view: "report", icon: "report" },
  { view: "goals", icon: "goals" },
  { view: "rules", icon: "rules" },
  { view: "settings", icon: "settings" },
];

export function App() {
  const s = useStore();
  const t = useT();
  const { view, setView, date, setDate, settings, setPaletteOpen, paletteOpen } = s;
  const [pauseMenu, setPauseMenu] = useState<{ x: number; y: number } | null>(null);


  useEffect(() => {
    const kbd = (e: KeyboardEvent) => e.key === "Tab" && document.body.classList.add("kbd");
    const ptr = () => document.body.classList.remove("kbd");
    window.addEventListener("keydown", kbd);
    window.addEventListener("pointerdown", ptr);
    return () => {
      window.removeEventListener("keydown", kbd);
      window.removeEventListener("pointerdown", ptr);
    };
  }, []);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
        return;
      }
      const t = e.target as HTMLElement;
      if (paletteOpen || e.ctrlKey || e.metaKey || e.altKey || t.closest("input, select, textarea, .dial, [role=menu]")) return;
      const step = view === "week" ? 7 : 1;
      if (e.key === "ArrowLeft" && (view === "today" || view === "week")) setDate(addDays(date, -step));
      else if (e.key === "ArrowRight" && (view === "today" || view === "week")) {
        const next = addDays(date, step);
        if (next.getTime() <= Date.now()) setDate(next);
      } else if (e.key.toLowerCase() === "t") setDate(new Date());
      else if (/^[1-7]$/.test(e.key)) setView(NAV[Number(e.key) - 1].view);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, date, setDate, setView, paletteOpen, setPaletteOpen]);

  const showDates = view === "today" || view === "week";
  const status = s.status;
  const paused = !!status && status.pausedUntil > Date.now();
  const cur = status?.current.state ?? "none";

  const pauseItems: MenuItem[] = paused
    ? [{ label: t("pause.resume"), icon: "play", run: () => api.pause(0) }]
    : [
        { heading: true, label: t("pause.heading") },
        { label: t("pause.m15"), icon: "pause", run: () => api.pause(Date.now() + 15 * 60_000) },
        { label: t("pause.h1"), icon: "pause", run: () => api.pause(Date.now() + 60 * 60_000) },
        { label: t("pause.tomorrow"), icon: "moon", run: () => api.pause(dayBounds(new Date())[1]) },
      ];

  return (
    <div className="shell">

      <nav className="rail" aria-label={t("nav.main")} onMouseEnter={() => tourSignal("rail")}>
        <div className="rail-panel">
          <div className="rail-logo" data-tauri-drag-region>
            <Logo size={34} />
            <span className="rail-brand" data-tauri-drag-region>
              ZTally
            </span>
          </div>
          {NAV.map((n, i) => (
            <button key={n.view} className={`rail-btn ${view === n.view ? "on" : ""}`} onClick={() => setView(n.view)} aria-current={view === n.view ? "page" : undefined} aria-label={t(`nav.${n.view}`)}>
              <span className="rail-icon">
                <Icon name={n.icon} size={20} />
              </span>
              <span className="rail-label">{t(`nav.${n.view}`)}</span>
              <kbd className="rail-kbd">{i + 1}</kbd>
            </button>
          ))}
          <div className="grow" />
          <button
            className={`rail-status ${paused ? "paused" : cur === "away" ? "away" : ""}`}
            aria-label={paused ? t("orb.pausedAria") : t("orb.trackingAria")}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPauseMenu({ x: r.right + 8, y: r.bottom - 150 });
            }}
          >
            <span className="rail-icon">
              <Icon name={paused ? "play" : cur === "away" ? "moon" : "pause"} size={18} />
            </span>
            <span className="rail-status-text">
              <b>{t(`orb.${paused ? "paused" : cur === "away" ? "away" : "tracking"}`)}</b>
              <span>{paused && status ? t("ticker.pausedUntil", { time: fmtClock(status.pausedUntil) }) : t("rail.today", { time: fmtDur(status?.todayMs ?? 0) })}</span>
            </span>
            <span className="rail-mini mono">{fmtDur(status?.todayMs ?? 0).replace(/ \d+m$/, "")}</span>
          </button>
        </div>
      </nav>

      <main className="main">
        <header className="topbar" data-tauri-drag-region>
          <h1 className="view-title" data-tauri-drag-region>
            {t(`titles.${view}`)}
          </h1>
          {showDates && <DateNav />}
          <div className="grow" />
          <NowTicker />
          <button className="palette-btn" onClick={() => setPaletteOpen(true)} aria-label={t("palette.open")}>
            <Icon name="search" size={15} />
            <span>{t("palette.button")}</span>
            <kbd>Ctrl K</kbd>
          </button>
          <WindowControls />
        </header>
        <div className="view" key={view}>
          {view === "today" && <Today />}
          {view === "week" && <Week />}
          {view === "calendar" && <Calendar />}
          {view === "report" && <Report />}
          {view === "goals" && <Goals />}
          {view === "rules" && <Rules />}
          {view === "settings" && <Settings />}
        </div>
      </main>

      <Palette />
      <FocusReport />
      <ExtensionWizardModal />
      <Tour />
      {pauseMenu && <Menu x={pauseMenu.x} y={pauseMenu.y} items={pauseItems} onClose={() => setPauseMenu(null)} />}
      <Toasts />
      {settings && !settings.onboarded && <Onboarding />}
    </div>
  );
}


function WindowControls() {
  const t = useT();
  const [max, setMax] = useState(false);
  useEffect(() => {
    const w = getCurrentWindow();
    w.isMaximized().then(setMax).catch(() => {});
    const un = w.onResized(() => w.isMaximized().then(setMax).catch(() => {}));
    return () => {
      un.then((f) => f());
    };
  }, []);
  const w = getCurrentWindow();
  return (
    <div className="winctl">
      <button onClick={() => w.minimize()} aria-label={t("window.minimize")} title={t("window.minimize")}>
        <Icon name="winMin" size={14} />
      </button>
      <button onClick={() => w.toggleMaximize()} aria-label={t(max ? "window.restore" : "window.maximize")} title={t(max ? "window.restore" : "window.maximize")}>
        <Icon name={max ? "winRestore" : "winMax"} size={14} />
      </button>
      <button className="close" onClick={() => w.close()} aria-label={t("window.close")} title={t("window.closeHint")}>
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}

function DateNav() {
  const { view, date, setDate, settings } = useStore();
  const t = useT();
  const weekly = view !== "today";
  const step = weekly ? 7 : 1;
  const today = new Date();
  let label: string;
  let atNow: boolean;
  if (weekly) {
    const ws = startOfWeek(date, settings?.weekStartsMonday ?? true);
    const we = addDays(ws, 6);
    label = t("date.range", { from: fmtShortDate(ws), to: fmtShortDate(we) });
    atNow = isSameDay(ws, startOfWeek(today, settings?.weekStartsMonday ?? true));
  } else {
    label = relativeDay(date, t);
    atNow = isSameDay(date, today);
  }
  return (
    <div className="datenav">
      <button className="icon-btn" onClick={() => setDate(addDays(date, -step))} aria-label={t(weekly ? "date.prevWeek" : "date.prevDay")}>
        <Icon name="left" size={16} />
      </button>
      <span className="datenav-label">{label}</span>
      <button className="icon-btn" disabled={atNow} onClick={() => setDate(addDays(date, step))} aria-label={t(weekly ? "date.nextWeek" : "date.nextDay")}>
        <Icon name="right" size={16} />
      </button>
      {!atNow && (
        <button className="chip" onClick={() => setDate(new Date())}>
          {t(weekly ? "date.thisWeek" : "date.today")}
        </button>
      )}
    </div>
  );
}

function NowTicker() {
  const { status } = useStore();
  const t = useT();
  if (!status) return null;
  const c = status.current;
  const paused = status.pausedUntil > Date.now();
  const since = fmtDur(Date.now() - c.since, { seconds: true });
  if (!status.backend.ok) {
    return (
      <div className="ticker warn">
        <Icon name="alert" size={14} /> {t("ticker.unavailable", { backend: status.backend.label })}
      </div>
    );
  }
  if (status.focus) {
    const left = Math.max(0, status.focus.end - Date.now());
    return (
      <div className="ticker focus">
        <Icon name="bolt" size={14} /> {t("ticker.focus", { min: Math.ceil(left / 60_000) })}
        {c.state === "active" && c.display && <span className="dim">· {c.display}</span>}
      </div>
    );
  }
  if (paused) {
    return (
      <div className="ticker paused-t">
        <Icon name="pause" size={14} /> {t("ticker.pausedUntil", { time: fmtClock(status.pausedUntil) })}
        <button className="chip" onClick={() => api.pause(0)}>
          {t("ticker.resume")}
        </button>
      </div>
    );
  }
  if (c.state === "away") {
    return (
      <div className="ticker">
        <Icon name="moon" size={14} /> {t("ticker.away", { since })}
      </div>
    );
  }
  if (c.state === "self") {
    return (
      <div className="ticker dim" title={t("ticker.selfHint")}>
        <Icon name="eyeOff" size={14} /> {t("ticker.self")}
      </div>
    );
  }
  if (c.state !== "active" || !c.display) {
    return (
      <div className="ticker dim">
        {t("ticker.waiting")}
      </div>
    );
  }
  return (
    <div className="ticker" title={c.title ?? undefined}>
      <Glyph label={c.display} size={18} />
      <b>{c.display}</b>
      {c.domain && <span className="dim">{c.domain}</span>}
      <span className="mono dim">{since}</span>
    </div>
  );
}

function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && (
            <button className="chip" onClick={t.action.run}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
