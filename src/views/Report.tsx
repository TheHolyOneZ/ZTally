

import { save } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import { Empty, Segmented } from "../components/bits";
import { Icon } from "../components/Icon";
import { api, type Category, type FocusRecord, type RangeView } from "../lib/ipc";
import { currentLocale, useT, type TFn } from "../lib/i18n";
import { useCatName, useLoader, useStore } from "../lib/store";
import { addDays, dayBounds, fmtClock, fmtDur, fmtWeekday, pct, startOfDay, startOfWeek, weekDays } from "../lib/time";

type Line =
  | { k: "brand" }
  | { k: "center"; text: string; big?: boolean }
  | { k: "row"; left: string; right: string; strong?: boolean; big?: boolean; indent?: boolean }
  | { k: "head"; text: string }
  | { k: "dash" }
  | { k: "double" }
  | { k: "note"; text: string }
  | { k: "barcode"; values: number[] }
  | { k: "space" };

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

type CatName = (c: Category | null | undefined) => string;
const up = (s: string) => s.toLocaleUpperCase(currentLocale());

export type PeriodKind = "day" | "week" | "month" | "custom";

export interface Period {
  kind: PeriodKind;
  days: [number, number][];
  prevDays: [number, number][] | null;
}

function observations(cur: RangeView, prev: RangeView | null, cats: Category[], t: TFn, catName: CatName): string[] {
  const out: string[] = [];
  const s = cur.summary;
  const p = prev?.summary ?? { ...s, activeMs: 0, productiveMs: 0, distractingMs: 0 };
  const share = (a: number, b: number) => (b > 0 ? a / b : 0);
  const drift = share(s.distractingMs, s.activeMs);
  const driftPrev = share(p.distractingMs, p.activeMs);
  if (p.activeMs > 0 && drift - driftPrev > 0.05) {
    const worst = s.categories
      .map((c) => ({ ...c, cat: cats.find((x) => x.id === c.id) }))
      .find((c) => c.cat?.kind === "distracting");
    out.push(t("receipt.obs.driftRose", { now: Math.round(drift * 100), before: Math.round(driftPrev * 100), category: worst?.cat ? catName(worst.cat) : t("receipt.obs.distractions") }));
  } else if (p.activeMs > 0 && s.productiveMs > p.productiveMs * 1.1) {
    out.push(t("receipt.obs.moreFocusPrev", { time: fmtDur(s.productiveMs - p.productiveMs) }));
  }

  const hours = Array.from({ length: 24 }, (_, h) => cur.days.reduce((a, d) => a + (d.hours[h]?.activeMs ?? 0), 0));
  const peak = hours.indexOf(Math.max(...hours));
  if (hours[peak] > 0) out.push(t("receipt.obs.busiestHour", { from: `${String(peak).padStart(2, "0")}:00`, to: `${String(peak + 1).padStart(2, "0")}:00` }));
  const late = cur.days.filter((d) => (d.hours[23]?.activeMs ?? 0) > 10 * 60_000).length;
  if (late >= 2) out.push(t("receipt.obs.lateNights", { count: late }));
  if (s.switches > 0 && s.activeMs > 0) {
    const perHour = s.switches / (s.activeMs / 3_600_000);
    if (perHour > 40) out.push(t("receipt.obs.switching", { n: Math.round(perHour) }));
  }
  return out.slice(0, 2);
}

function periodLines(period: Period, t: TFn): Line[] {
  const start = new Date(period.days[0][0]);
  const end = new Date(period.days[period.days.length - 1][0]);
  const loc = currentLocale();
  const f = (d: Date) => up(d.toLocaleDateString(loc, { day: "numeric", month: "short" }));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  switch (period.kind) {
    case "day":
      return [
        { k: "center", text: up(start.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) },
        { k: "center", text: t("receipt.number", { n: iso(start) }) },
      ];
    case "week":
      return [
        { k: "center", text: `${t("date.range", { from: f(start), to: f(end) })} ${end.getFullYear()}` },
        { k: "center", text: t("receipt.number", { n: isoWeek(start) }) },
      ];
    case "month":
      return [
        { k: "center", text: up(start.toLocaleDateString(loc, { month: "long", year: "numeric" })) },
        { k: "center", text: t("receipt.number", { n: iso(start).slice(0, 7) }) },
      ];
    case "custom":
      return [
        { k: "center", text: up(t("receipt.nDays", { count: period.days.length })) },
        { k: "center", text: period.days.length === 1 ? f(start) : `${t("date.range", { from: f(start), to: f(end) })} ${end.getFullYear()}` },
      ];
  }
}

export function buildReceipt(period: Period, cur: RangeView, prev: RangeView | null, cats: Category[], focus: FocusRecord[], t: TFn, catName: CatName): Line[] {
  const s = cur.summary;
  const L: Line[] = [
    { k: "brand" },
    { k: "center", text: up(t(`receipt.heading.${period.kind}`)) },
    ...periodLines(period, t),
    { k: "dash" },
    { k: "row", left: up(t("receipt.item")), right: up(t("receipt.time")), strong: true },
  ];
  for (const c of s.categories) {
    const cat = cats.find((x) => x.id === c.id);
    L.push({ k: "row", left: up(catName(cat)), right: fmtDur(c.ms) });
    L.push({ k: "row", left: `@ ${t("receipt.ofTotal", { pct: pct(c.ms, s.activeMs) })}`, right: "", indent: true });
  }
  L.push(
    { k: "dash" },
    { k: "row", left: up(t("receipt.subtotal")), right: fmtDur(s.activeMs) },
    { k: "row", left: up(t("receipt.away")), right: fmtDur(s.afkMs) },
    ...(s.backgroundMs > 0 ? [{ k: "row" as const, left: up(t("receipt.background")), right: fmtDur(s.backgroundMs) }] : []),
    ...(s.callMs > 0 ? [{ k: "row" as const, left: up(t("receipt.calls")), right: fmtDur(s.callMs) }] : []),
    { k: "row", left: up(t("receipt.focused")), right: `${pct(s.productiveMs, s.activeMs)}%` },
    { k: "row", left: up(t("receipt.drift")), right: `${pct(s.distractingMs, s.activeMs)}%` },
    { k: "dash" },
    { k: "head", text: up(t("receipt.topApps")) },
  );
  for (const a of s.apps.slice(0, 5)) L.push({ k: "row", left: up(a.label), right: fmtDur(a.ms) });
  if (s.domains.length) {
    L.push({ k: "head", text: up(t("receipt.topSites")) });
    for (const d of s.domains.slice(0, 3)) L.push({ k: "row", left: up(d.label), right: fmtDur(d.ms) });
  }
  const best = cur.days.reduce((a, b) => (b.activeMs > a.activeMs ? b : a), cur.days[0]);
  L.push({ k: "dash" });
  if (focus.length) {
    const planned = focus.reduce((a, f) => a + (f.end - f.start), 0);
    const drift = focus.reduce((a, f) => a + f.driftMs, 0);
    L.push({ k: "row", left: `${up(t("receipt.focusSessions"))} x${focus.length}`, right: fmtDur(planned) });
    L.push({ k: "row", left: `@ ${t("receipt.onTask", { pct: pct(planned - drift, planned) })}`, right: "", indent: true });
  }
  if (s.focus) L.push({ k: "row", left: up(t("receipt.bestStreak")), right: `${up(fmtWeekday(s.focus.start))} ${fmtClock(s.focus.start)}, ${fmtDur(s.focus.ms)}` });
  if (best?.activeMs && cur.days.length > 1) L.push({ k: "row", left: up(t("receipt.busiestDay")), right: `${up(fmtWeekday(best.start))}, ${fmtDur(best.activeMs)}` });
  L.push({ k: "row", left: up(t("receipt.switches")), right: s.switches.toLocaleString(currentLocale()) });
  if (prev && prev.summary.activeMs > 0) {
    const d = Math.round(((s.activeMs - prev.summary.activeMs) / prev.summary.activeMs) * 100);
    L.push({ k: "row", left: up(t("receipt.vsPrev")), right: `${d > 0 ? "+" : ""}${d}%` });
  }
  L.push({ k: "double" }, { k: "row", left: up(t("receipt.total")), right: fmtDur(s.activeMs), big: true }, { k: "space" });
  for (const o of observations(cur, prev, cats, t, catName)) L.push({ k: "note", text: o });
  L.push(
    { k: "space" },
    { k: "barcode", values: cur.days.map((d) => d.activeMs) },
    { k: "center", text: up(t("receipt.thanks")) },
    { k: "center", text: t("receipt.local") },
  );
  return L;
}


function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function renderPng(lines: Line[]): Promise<Uint8Array> {
  await document.fonts.ready;
  const W = 440;
  const PAD = 28;
  const scale = 2;
  const css = getComputedStyle(document.documentElement);
  const paper = "#f7f1e3";
  const ink = "#26211a";
  const muted = "#7b705e";
  const mono = css.getPropertyValue("--mono") || "monospace";
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `13px ${mono}`;


  let h = 40;
  for (const l of lines) {
    if (l.k === "brand") h += 56;
    else if (l.k === "note") h += wrap(measure, l.text, W - PAD * 2).length * 19 + 6;
    else if (l.k === "barcode") h += 72;
    else if (l.k === "space") h += 10;
    else if (l.k === "dash" || l.k === "double") h += 18;
    else if (l.k === "row" && l.big) h += 30;
    else h += 20;
  }
  h += 30;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  ctx.fillStyle = paper;
  ctx.beginPath();
  const z = 8;
  ctx.moveTo(0, z);
  for (let x = 0; x <= W; x += z * 2) {
    ctx.lineTo(x + z, 0);
    ctx.lineTo(x + z * 2, z);
  }
  ctx.lineTo(W, h - z);
  for (let x = W; x >= 0; x -= z * 2) {
    ctx.lineTo(x - z, h);
    ctx.lineTo(x - z * 2, h - z);
  }
  ctx.closePath();
  ctx.fill();

  let y = 34;
  ctx.textBaseline = "alphabetic";
  for (const l of lines) {
    ctx.fillStyle = ink;
    ctx.font = `13px ${mono}`;
    switch (l.k) {
      case "brand":
        ctx.font = `700 30px ${mono}`;
        ctx.textAlign = "center";
        ctx.fillText("Z T A L L Y", W / 2, y + 24);
        y += 56;
        break;
      case "center":
        ctx.textAlign = "center";
        ctx.fillStyle = muted;
        ctx.font = `12px ${mono}`;
        ctx.fillText(l.text, W / 2, y);
        y += 20;
        break;
      case "head":
        ctx.textAlign = "left";
        ctx.font = `700 12px ${mono}`;
        ctx.fillText(l.text, PAD, y);
        y += 20;
        break;
      case "row": {
        ctx.font = `${l.strong || l.big ? "700 " : ""}${l.big ? 20 : l.indent ? 11 : 13}px ${mono}`;
        ctx.fillStyle = l.indent ? muted : ink;
        ctx.textAlign = "left";
        ctx.fillText(l.left, PAD + (l.indent ? 14 : 0), y + (l.big ? 8 : 0));
        ctx.textAlign = "right";
        ctx.fillText(l.right, W - PAD, y + (l.big ? 8 : 0));
        y += l.big ? 30 : 20;
        break;
      }
      case "dash":
      case "double":
        ctx.strokeStyle = muted;
        ctx.setLineDash(l.k === "dash" ? [4, 4] : []);
        ctx.lineWidth = 1;
        for (const off of l.k === "double" ? [-2, 2] : [0]) {
          ctx.beginPath();
          ctx.moveTo(PAD, y - 4 + off);
          ctx.lineTo(W - PAD, y - 4 + off);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        y += 18;
        break;
      case "note":
        ctx.textAlign = "left";
        ctx.font = `italic 13px ${mono}`;
        for (const t of wrap(measure, l.text, W - PAD * 2)) {
          ctx.fillText(t, PAD, y);
          y += 19;
        }
        y += 6;
        break;
      case "barcode": {
        const bars = barcodeBars(l.values);
        const bw = (W - PAD * 2) / bars.length;
        bars.forEach((b, i) => {
          if (b > 0) ctx.fillRect(PAD + i * bw, y, Math.max(1, bw * b), 44);
        });
        y += 72;
        break;
      }
      case "space":
        y += 10;
        break;
    }
  }
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}


function barcodeBars(values: number[]): number[] {
  const max = Math.max(1, ...values);
  const out: number[] = [];
  values.forEach((v, i) => {
    const n = 3 + Math.round((v / max) * 6);
    for (let j = 0; j < n; j++) out.push(((i * 7 + j * 3) % 5) / 6 + 0.25, 0);
    out.push(0, 0);
  });
  return out;
}

function monthDays(anchor: Date): [number, number][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const next = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const out: [number, number][] = [];
  for (let d = first; d < next; d = addDays(d, 1)) out.push(dayBounds(d));
  return out;
}

function periodFor(kind: PeriodKind, anchor: Date, picked: number[], mondayFirst: boolean): Period {
  switch (kind) {
    case "day":
      return { kind, days: [dayBounds(anchor)], prevDays: [dayBounds(addDays(anchor, -1))] };
    case "week": {
      const ws = startOfWeek(anchor, mondayFirst);
      return { kind, days: weekDays(ws), prevDays: weekDays(addDays(ws, -7)) };
    }
    case "month":
      return { kind, days: monthDays(anchor), prevDays: monthDays(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)) };
    case "custom": {
      const sorted = [...picked].sort((x, y) => x - y);
      return { kind, days: sorted.map((d) => dayBounds(new Date(d))), prevDays: null };
    }
  }
}

function shift(kind: PeriodKind, anchor: Date, dir: 1 | -1): Date {
  if (kind === "day") return addDays(anchor, dir);
  if (kind === "week") return addDays(anchor, 7 * dir);
  return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
}


export function DayPicker({ picked, onChange }: { picked: number[]; onChange: (days: number[]) => void }) {
  const t = useT();
  const { settings } = useStore();
  const monday = settings?.weekStartsMonday ?? true;
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [last, setLast] = useState<number | null>(null);
  const set = new Set(picked);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const lead = (month.getDay() - (monday ? 1 : 0) + 7) % 7;
  const today = startOfDay(new Date()).getTime();
  const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, (monday ? 1 : 0) + i).toLocaleDateString(currentLocale(), { weekday: "narrow" }));

  const toggle = (d: number, range: boolean) => {
    const s2 = new Set(set);
    if (range && last !== null) {
      const [a, b] = d < last ? [d, last] : [last, d];
      for (let x = new Date(a); x.getTime() <= b; x = addDays(x, 1)) s2.add(startOfDay(x).getTime());
    } else if (s2.has(d)) s2.delete(d);
    else s2.add(d);
    setLast(d);
    onChange([...s2]);
  };

  return (
    <div className="daypicker">
      <div className="dp-head">
        <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label={t("calendar.prev")}>
          <Icon name="left" size={14} />
        </button>
        <b>{month.toLocaleDateString(currentLocale(), { month: "long", year: "numeric" })}</b>
        <button className="icon-btn" disabled={next.getTime() > today} onClick={() => setMonth(next)} aria-label={t("calendar.next")}>
          <Icon name="right" size={14} />
        </button>
      </div>
      <div className="dp-grid">
        {names.map((n, i) => (
          <span key={i} className="dp-name">
            {n}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={"l" + i} />
        ))}
        {monthDays(month).map(([d]) => (
          <button key={d} className={`dp-day ${set.has(d) ? "on" : ""} ${d === today ? "is-today" : ""}`} disabled={d > today} onClick={(e) => toggle(d, e.shiftKey)}>
            {new Date(d).getDate()}
          </button>
        ))}
      </div>
      <div className="dp-foot">
        <span className="dim small">{t("receipt.pickHint")}</span>
        {picked.length > 0 && (
          <button className="chip" onClick={() => onChange([])}>
            {t("receipt.clear")}
          </button>
        )}
      </div>
    </div>
  );
}

export function Report() {
  const { categories, toast, version, settings, date } = useStore();
  const t = useT();
  const catName = useCatName();
  const mondayFirst = settings?.weekStartsMonday ?? true;
  const [kind, setKind] = useState<PeriodKind>("week");
  const [anchor, setAnchor] = useState(() => date);
  const [picked, setPicked] = useState<number[]>(() => [startOfDay(new Date()).getTime()]);
  const period = useMemo(() => periodFor(kind, anchor, picked, mondayFirst), [kind, anchor, picked, mondayFirst]);
  const key = period.days.map((d) => d[0]).join(",");
  const data = useLoader(async () => {
    if (period.days.length === 0) return null;
    const [cur, prev] = await Promise.all([api.range(period.days), period.prevDays ? api.range(period.prevDays) : Promise.resolve(null)]);
    const all = await api.focusHistory(period.days[0][0], period.days[period.days.length - 1][1]);
    const focus = all.filter((f) => period.days.some(([s, e]) => f.start >= s && f.start < e));
    return { cur, prev, focus };
  }, [key, version]);

  const atNow = kind !== "custom" && period.days[period.days.length - 1][1] > Date.now();

  const noDays = period.days.length === 0;
  const lines = data && !noDays ? buildReceipt(period, data.cur, data.prev, categories, data.focus, t, catName) : [];
  const empty = noDays || !data || data.cur.summary.activeMs === 0;
  const stamp = `${kind}-${new Date(period.days[0]?.[0] ?? Date.now()).toISOString().slice(0, 10)}`;

  const saveTo = async (ext: "png" | "csv" | "json") => {
    const path = await save({ defaultPath: `ztally-${stamp}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return;
    try {
      if (ext === "png") await api.saveBytes(path, await renderPng(lines));
      else await api.export(period.days, ext, path);
      toast(t("receipt.saved", { file: path.split(/[\\/]/).pop() ?? path }));
    } catch (e) {
      toast(t("receipt.saveFailed", { error: String(e) }));
    }
  };

  return (
    <div className="report">
      <div className="receipt-stage">
        {empty ? (
          <div className="card pad receipt-empty">
            <Empty icon="report" title={t(noDays ? "receipt.pickTitle" : "receipt.emptyTitle")}>
              {t(noDays ? "receipt.pickBody" : "receipt.emptyBody")}
            </Empty>
          </div>
        ) : (
          <article className="receipt" aria-label={t("receipt.aria")} key={key}>
            {lines.map((l, i) => (
              <ReceiptLine key={i} l={l} />
            ))}
          </article>
        )}
      </div>
      <aside className="report-side">
        <div className="card pad">
          <h2 className="side-title">{t("receipt.period")}</h2>
          <Segmented
            size="sm"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setAnchor(new Date());
            }}
            options={(["day", "week", "month", "custom"] as const).map((k) => ({ value: k, label: t(`receipt.kind.${k}`) }))}
          />
          {kind === "custom" ? (
            <DayPicker picked={picked} onChange={setPicked} />
          ) : (
            <div className="datenav receipt-nav">
              <button className="icon-btn" onClick={() => setAnchor(shift(kind, anchor, -1))} aria-label={t("calendar.prev")}>
                <Icon name="left" size={16} />
              </button>
              <span className="datenav-label">{(periodLines(period, t)[0] as { text: string }).text}</span>
              <button className="icon-btn" disabled={atNow} onClick={() => setAnchor(shift(kind, anchor, 1))} aria-label={t("calendar.next")}>
                <Icon name="right" size={16} />
              </button>
            </div>
          )}
        </div>
        <div className="card pad">
          <h2 className="side-title">{t("receipt.sideTitle")}</h2>
          <p className="dim small">{t("receipt.sideBody")}</p>
          <div className="btn-col">
            <button className="btn primary" disabled={empty} onClick={() => saveTo("png")}>
              <Icon name="image" size={16} /> {t("receipt.png")}
            </button>
            <button className="btn" disabled={empty} onClick={() => saveTo("csv")}>
              <Icon name="download" size={16} /> {t("receipt.csvRange")}
            </button>
            <button className="btn" disabled={empty} onClick={() => saveTo("json")}>
              <Icon name="download" size={16} /> {t("receipt.jsonRange")}
            </button>
            <button className="btn ghost" disabled={empty} onClick={() => window.print()}>
              <Icon name="printer" size={16} /> {t("receipt.print")}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ReceiptLine({ l }: { l: Line }) {
  switch (l.k) {
    case "brand":
      return <div className="r-brand">Z T A L L Y</div>;
    case "center":
      return <div className="r-center">{l.text}</div>;
    case "head":
      return <div className="r-head">{l.text}</div>;
    case "row":
      return (
        <div className={`r-row ${l.strong ? "bold" : ""} ${l.big ? "big" : ""} ${l.indent ? "indent" : ""}`}>
          <span>{l.left}</span>
          <span className="r-fill" />
          <span>{l.right}</span>
        </div>
      );
    case "dash":
      return <div className="r-dash" />;
    case "double":
      return <div className="r-double" />;
    case "note":
      return <p className="r-note">{l.text}</p>;
    case "barcode":
      return (
        <div className="r-barcode" aria-hidden="true">
          {barcodeBars(l.values).map((b, i) => (
            <span key={i} style={{ flexGrow: b > 0 ? b : 0.6, background: b > 0 ? "currentColor" : "transparent" }} />
          ))}
        </div>
      );
    case "space":
      return <div className="r-space" />;
  }
}
