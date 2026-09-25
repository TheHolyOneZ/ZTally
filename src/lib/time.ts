import { currentLocale, type TFn } from "./i18n";


export const MIN = 60_000;
export const HOUR = 3_600_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function dayBounds(d: Date): [number, number] {
  const s = startOfDay(d);
  return [s.getTime(), addDays(s, 1).getTime()];
}

export function startOfWeek(d: Date, mondayFirst: boolean): Date {
  const s = startOfDay(d);
  const dow = s.getDay();
  const offset = mondayFirst ? (dow + 6) % 7 : dow;
  return addDays(s, -offset);
}

export function weekDays(weekStart: Date): [number, number][] {
  return Array.from({ length: 7 }, (_, i) => dayBounds(addDays(weekStart, i)));
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}


export function fmtDur(ms: number, opts: { seconds?: boolean } = {}): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / MIN);
  if (totalMin < 1) return opts.seconds ? `${Math.round(ms / 1000)}s` : "<1m";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}


export function fmtHours(ms: number): string {
  const h = ms / HOUR;
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`;
}

export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(currentLocale(), { hour: "2-digit", minute: "2-digit" });
}

export function fmtDay(d: Date, style: "long" | "short" = "long"): string {
  return d.toLocaleDateString(currentLocale(), style === "long"
    ? { weekday: "long", day: "numeric", month: "long" }
    : { weekday: "short", day: "numeric", month: "short" });
}

export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString(currentLocale(), { day: "numeric", month: "short" });
}

export function fmtWeekday(ms: number): string {
  return new Date(ms).toLocaleDateString(currentLocale(), { weekday: "short" });
}

export function relativeDay(d: Date, t: TFn): string {
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / (24 * HOUR));
  if (diff === 0) return t("date.today");
  if (diff === -1) return t("date.yesterday");
  return fmtDay(d, "short");
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
