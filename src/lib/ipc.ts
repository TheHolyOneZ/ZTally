
import { invoke } from "@tauri-apps/api/core";

export type Kind = "productive" | "neutral" | "distracting";

export interface Category {
  id: number;
  name: string;
  slot: number;
  kind: Kind;
}

export interface Rule {
  id: number;
  priority: number;
  matchType: "app" | "domain" | "title";
  pattern: string;
  categoryId: number;
}

export interface Goal {
  id: number;
  targetKind: "total" | "category" | "app" | "domain";
  target: string;
  period: "day" | "week";
  op: "max" | "min";
  minutes: number;
}

export interface GoalProgress {
  goal: Goal;
  usedMs: number;
  ratio: number;
}

export interface Settings {
  idleThresholdS: number;
  recordTitles: boolean;
  titleExclusions: string[];
  mediaApps: string[];
  ignoredApps: string[];
  onboarded: boolean;
  theme: "system" | "dark" | "light";
  weekStartsMonday: boolean;
  notifications: boolean;
  weeklyReportNotice: boolean;
  bridgePort: number;
  trackSelf: boolean;
  focusMinutes: number;
  trackBackgroundAudio: boolean;

  language: string;
  style: string;
  corners: "sharp" | "soft" | "rounded" | "round";

  uiScale: number;
  font: "grotesk" | "system" | "mono";
  reduceMotion: boolean;
  trackCalls: boolean;
}

export interface BackendInfo {
  id: string;
  label: string;
  ok: boolean;
  idleSupported: boolean;
  note: string | null;
  fix: string | null;
}

export interface Current {
  state: "active" | "away" | "paused" | "self" | "none";
  app?: string | null;
  display?: string | null;
  title?: string | null;
  domain?: string | null;
  since: number;
  idleMs: number;
}

export interface Status {
  backend: BackendInfo;
  current: Current;
  pausedUntil: number;
  extensionConnected: boolean;
  dbPath: string;
  firstDay: number | null;
  version: string;
  platform: "linux" | "windows";
  focus: FocusSession | null;
  todayMs: number;
  extensionBrowser: "chromium" | "firefox" | null;
}

export interface BrowserInfo {
  id: string;
  name: string;
  family: "chromium" | "firefox";
  extPage: string;
}

export interface FocusSession {
  start: number;
  end: number;
  plannedMs: number;
  driftMs: number;
  driftRunMs: number;
}

export interface FocusRecord {
  start: number;
  end: number;
  plannedMs: number;
  driftMs: number;
  completed: boolean;
}

export interface BgSeg {
  from: number;
  to: number;
  app: string;
  display: string;
  title: string;
  cat: number | null;
}

export interface Cell {
  app: string;
  display: string;
  title: string;
  domain: string | null;
  cat: number | null;
}

export interface LedgerItem {
  key: string;
  label: string;
  cat: number | null;
  ms: number;
  mixed: boolean;
  titles: [string, number][];
}

export interface CatTotal {
  id: number | null;
  ms: number;
}

export interface Streak {
  start: number;
  end: number;
  ms: number;
}

export interface Summary {
  activeMs: number;
  afkMs: number;
  productiveMs: number;
  distractingMs: number;
  firstMs: number | null;
  lastMs: number | null;
  switches: number;
  focus: Streak | null;
  categories: CatTotal[];
  apps: LedgerItem[];
  domains: LedgerItem[];
  backgroundMs: number;

  backgroundFocusMs: number;
  background: BackgroundItem[];

  callMs: number;
  calls: BackgroundItem[];
}


export interface BackgroundItem extends LedgerItem {

  via: string | null;

  during: [number | null, number][];
  awayMs: number;
}

export interface DayView {
  start: number;
  end: number;
  minutes: number[];
  cells: Cell[];
  background: BgSeg[];
  calls: BgSeg[];
  summary: Summary;
}

export interface HourCell {
  activeMs: number;
  cat: number | null;
}

export interface DayTotal {
  start: number;
  end: number;
  activeMs: number;
  afkMs: number;
  categories: CatTotal[];
  hours: HourCell[];
}

export interface RangeView {
  start: number;
  end: number;
  days: DayTotal[];
  summary: Summary;
}

export interface AppEntry {
  key: string;
  display: string;
  path: string | null;
  totalMs: number;
  lastSeen: number;
}

export const api = {
  status: () => invoke<Status>("status"),
  day: (start: number, end: number) => invoke<DayView>("day", { start, end }),
  range: (days: [number, number][]) => invoke<RangeView>("range", { days }),
  categories: () => invoke<Category[]>("categories"),
  saveCategory: (category: Category) => invoke<number>("save_category", { category }),
  deleteCategory: (id: number) => invoke<void>("delete_category", { id }),
  rules: () => invoke<Rule[]>("rules"),
  addRule: (matchType: Rule["matchType"], pattern: string, categoryId: number) =>
    invoke<number>("add_rule", { matchType, pattern, categoryId }),
  deleteRule: (id: number) => invoke<void>("delete_rule", { id }),
  resetRules: () => invoke<void>("reset_rules"),
  goals: () => invoke<Goal[]>("goals"),
  saveGoal: (goal: Goal) => invoke<number>("save_goal", { goal }),
  deleteGoal: (id: number) => invoke<void>("delete_goal", { id }),
  goalProgress: (day: [number, number], week: [number, number]) =>
    invoke<GoalProgress[]>("goal_progress", { day, week }),
  settings: () => invoke<Settings>("settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  pause: (until: number) => invoke<void>("pause", { until }),
  forgetDays: (days: [number, number][]) => invoke<number>("forget_days", { days }),
  resetAll: () => invoke<void>("reset_all"),
  focusStart: (minutes: number) => invoke<void>("focus_start", { minutes }),
  focusStop: () => invoke<void>("focus_stop"),
  focusHistory: (start: number, end: number) => invoke<FocusRecord[]>("focus_history", { start, end }),
  apps: () => invoke<AppEntry[]>("apps"),
  domains: () => invoke<[string, number][]>("domains"),
  renameApp: (key: string, display: string) => invoke<void>("rename_app", { key, display }),
  forget: (start: number, end: number, appKey?: string) =>
    invoke<number>("forget", { start, end, appKey: appKey ?? null }),
  export: (days: [number, number][], format: "csv" | "json", path: string) => invoke<number>("export", { days, format, path }),
  saveBytes: (path: string, data: Uint8Array) => invoke<void>("save_bytes", { path, data: Array.from(data) }),
  installGnomeExtension: () => invoke<string>("install_gnome_extension"),
  openBrowserExtension: () => invoke<string>("open_browser_extension"),
  prepareExtension: () => invoke<string>("prepare_extension"),
  detectBrowsers: () => invoke<BrowserInfo[]>("detect_browsers"),

  openExtensionPage: (id: string) => invoke<boolean>("open_extension_page", { id }),
  openDataFolder: () => invoke<void>("open_data_folder"),
  openLink: (target: "website" | "source" | "author" | "projects" | "mods") => invoke<void>("open_link", { target }),
};

export const inTauri = "__TAURI_INTERNALS__" in window;
