

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useT } from "./i18n";
import { api, type Category, type Settings, type Status } from "./ipc";

export type View = "today" | "week" | "calendar" | "report" | "goals" | "rules" | "settings";

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface Store {
  view: View;
  setView: (v: View) => void;
  date: Date;
  setDate: (d: Date) => void;
  categories: Category[];
  catById: Map<number, Category>;
  settings: Settings | null;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  status: Status | null;
  version: number;
  bump: () => void;
  reloadCategories: () => Promise<void>;
  toast: (text: string, action?: Toast["action"]) => void;
  toasts: Toast[];
  highlight: string | null;
  setHighlight: (key: string | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;

  tour: boolean;
  setTour: (on: boolean) => void;

  extWizard: boolean;
  setExtWizard: (on: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("today");
  const [date, setDate] = useState(() => new Date());
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tour, setTour] = useState(false);
  const [extWizard, setExtWizard] = useState(false);
  const toastId = useRef(0);

  const reloadCategories = useCallback(async () => setCategories(await api.categories()), []);

  useEffect(() => {
    reloadCategories().catch((e) => console.error("[ztally] categories failed", e));
    api.settings().then(setSettings, (e) => console.error("[ztally] settings failed", e));
  }, [reloadCategories]);


  useEffect(() => {
    let alive = true;
    const tick = () => api.status().then((s) => alive && setStatus(s)).catch(() => {});
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);


  useEffect(() => {
    const t = settings?.theme ?? "system";
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }, [settings?.theme]);


  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.dataset.corners = settings.corners ?? "rounded";
    root.dataset.font = settings.font ?? "grotesk";
    root.dataset.motion = settings.reduceMotion ? "reduced" : "full";
  }, [settings?.corners, settings?.font, settings?.reduceMotion]);
  useEffect(() => {
    if (!settings) return;
    getCurrentWebview()
      .setZoom((settings.uiScale ?? 100) / 100)
      .catch(() => {});
  }, [settings?.uiScale]);
  useEffect(() => {
    const st = settings?.style ?? "chronograph";
    if (st === "chronograph") document.documentElement.removeAttribute("data-style");
    else document.documentElement.setAttribute("data-style", st);
  }, [settings?.style]);

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return;
      const next = { ...settings, ...patch };
      setSettings(next);
      await api.saveSettings(next);
    },
    [settings],
  );

  const toast = useCallback((text: string, action?: Toast["action"]) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3200);
  }, []);

  const value = useMemo<Store>(
    () => ({
      view,
      setView,
      date,
      setDate,
      categories,
      catById: new Map(categories.map((c) => [c.id, c])),
      settings,
      saveSettings,
      status,
      version,
      bump: () => setVersion((v) => v + 1),
      reloadCategories,
      toast,
      toasts,
      highlight,
      setHighlight,
      paletteOpen,
      tour,
      setTour,
      extWizard,
      setExtWizard,
      setPaletteOpen,
    }),
    [view, date, categories, settings, saveSettings, status, version, reloadCategories, toast, toasts, highlight, paletteOpen, tour, extWizard],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}


export function catColor(cat: Category | undefined | null): string {
  return cat ? `var(--c${cat.slot})` : "var(--c0)";
}


export function useLoader<T>(load: () => Promise<T>, deps: unknown[], everyMs?: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => load().then((d) => alive && setData(d)).catch((e) => console.error(e));
    run();
    const t = everyMs ? setInterval(run, everyMs) : undefined;
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };

  }, deps);
  return data;
}


const DEFAULT_CATS: Record<string, string> = {
  "Deep Work": "deepWork",
  Social: "social",
  Learning: "learning",
  Communication: "communication",
  Entertainment: "entertainment",
  Creative: "creative",
  General: "general",
  Games: "games",
};

export function useCatName(): (c: Category | null | undefined) => string {
  const t = useT();
  return (c) => (c ? (DEFAULT_CATS[c.name] ? t(`categories.defaults.${DEFAULT_CATS[c.name]}`) : c.name) : t("categories.uncategorised"));
}
