
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type AppEntry } from "../lib/ipc";
import { useT } from "../lib/i18n";
import { tourSignal } from "../lib/tour";
import { useStore, type View } from "../lib/store";
import { addDays, dayBounds } from "../lib/time";
import { Icon } from "./Icon";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

function score(q: string, s: string): number {
  if (!q) return 1;
  const a = s.toLowerCase();
  const b = q.toLowerCase();
  if (a.startsWith(b)) return 3;
  if (a.includes(b)) return 2;

  let i = 0;
  for (const ch of a) if (ch === b[i]) i++;
  return i === b.length ? 1 : 0;
}

export function Palette() {
  const { paletteOpen, setPaletteOpen, setView, setDate, setHighlight, toast, setTour, setExtWizard } = useStore();
  const t = useT();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [apps, setApps] = useState<AppEntry[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      tourSignal("palette");
      setQ("");
      setSel(0);
      api.apps().then(setApps).catch(() => {});
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [paletteOpen]);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (v: View, label: string, icon: string, hint: string): Cmd => ({ id: "v" + v, label, icon, hint, run: () => setView(v) });
    const pause = async (until: number, msg: string) => {
      await api.pause(until);
      toast(msg);
    };
    const now = Date.now();
    const list: Cmd[] = [
      go("today", t("palette.cmd.today"), "today", "1"),
      go("week", t("palette.cmd.week"), "week", "2"),
      go("calendar", t("palette.cmd.calendar"), "calendar", "3"),
      go("report", t("palette.cmd.report"), "report", "4"),
      go("goals", t("titles.goals"), "goals", "5"),
      go("rules", t("titles.rules"), "rules", "6"),
      go("settings", t("titles.settings"), "settings", "7"),
      { id: "d0", label: t("palette.cmd.jumpToday"), icon: "today", hint: "T", run: () => (setDate(new Date()), setView("today")) },
      { id: "d1", label: t("palette.cmd.jumpYesterday"), icon: "left", run: () => (setDate(addDays(new Date(), -1)), setView("today")) },
      { id: "w1", label: t("palette.cmd.lastReceipt"), icon: "report", run: () => (setDate(addDays(new Date(), -7)), setView("report")) },
      ...[25, 50, 90].map((m) => ({ id: `f${m}`, label: t("palette.cmd.focus", { min: m }), icon: "bolt", run: () => api.focusStart(m).then(() => toast(t("focus.started", { min: m }))) })),
      { id: "fend", label: t("palette.cmd.endFocus"), icon: "x", run: () => api.focusStop() },
      { id: "p15", label: t("palette.cmd.pause15"), icon: "pause", run: () => pause(now + 15 * 60_000, t("palette.toast.paused15")) },
      { id: "p60", label: t("palette.cmd.pause60"), icon: "pause", run: () => pause(now + 60 * 60_000, t("palette.toast.paused60")) },
      { id: "ptm", label: t("palette.cmd.pauseTomorrow"), icon: "moon", run: () => pause(dayBounds(new Date())[1], t("palette.toast.pausedTomorrow")) },
      { id: "res", label: t("pause.resume"), icon: "play", run: () => pause(0, t("palette.toast.resumed")) },
      { id: "ext", label: t("palette.cmd.extension"), icon: "puzzle", run: () => setExtWizard(true) },
      { id: "tour", label: t("palette.cmd.tour"), icon: "compass", run: () => setTour(true) },
      { id: "data", label: t("palette.cmd.dataFolder"), icon: "folder", run: () => api.openDataFolder() },
    ];
    for (const a of apps.slice(0, 60)) {
      list.push({
        id: "a" + a.key,
        label: t("palette.cmd.highlightApp", { app: a.display }),
        icon: "search",
        hint: t("palette.appHint"),
        run: () => (setView("today"), setHighlight(a.key)),
      });
    }
    return list;
  }, [apps, setView, setDate, setHighlight, toast, t, setTour, setExtWizard]);

  const results = useMemo(
    () =>
      cmds
        .map((c) => ({ c, s: score(q, c.label) }))
        .filter((x) => x.s > 0 && (q || !x.c.id.startsWith("a")))
        .sort((a, b) => b.s - a.s)
        .slice(0, 9)
        .map((x) => x.c),
    [cmds, q],
  );

  if (!paletteOpen) return null;
  const run = (c?: Cmd) => {
    if (!c) return;
    setPaletteOpen(false);
    c.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={() => setPaletteOpen(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t("palette.aria")}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            ref={input}
            value={q}
            placeholder={t("palette.placeholder")}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPaletteOpen(false);
              if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(results.length - 1, s + 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
              if (e.key === "Enter") run(results[sel]);
            }}
            aria-activedescendant={results[sel]?.id}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {results.map((c, i) => (
            <li key={c.id} id={c.id} role="option" aria-selected={i === sel} className={i === sel ? "on" : ""} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
              <Icon name={c.icon} size={16} />
              <span className="grow">{c.label}</span>
              {c.hint && <kbd>{c.hint}</kbd>}
            </li>
          ))}
          {results.length === 0 && <li className="dim">{t("palette.noMatches")}</li>}
        </ul>
      </div>
    </div>
  );
}
