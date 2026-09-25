

import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { Category, DayView, FocusRecord, FocusSession } from "../lib/ipc";
import { useT } from "../lib/i18n";
import { catColor } from "../lib/store";

const S = 560;
const C = S / 2;
const R1 = 236;
const R0 = 180;
const TAU = Math.PI * 2;

function polar(r: number, a: number): [number, number] {
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function sector(r0: number, r1: number, a0: number, a1: number): string {

  if (a1 - a0 > Math.PI) {
    const mid = (a0 + a1) / 2;
    return sector(r0, r1, a0, mid) + sector(r0, r1, mid, a1);
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1);
  const [x3, y3] = polar(r0, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)}Z`;
}

function arc(r: number, a0: number, a1: number): string {
  if (a1 - a0 > Math.PI) {
    const mid = (a0 + a1) / 2;
    return arc(r, a0, mid) + arc(r, mid, a1).replace(/^M[^A]*/, "");
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

interface Seg {
  from: number;
  to: number;
  kind: "cat" | "afk";
  cat: number | null;
  dim: boolean;
}

interface Props {
  day: DayView;
  catById: Map<number, Category>;
  now: number | null;
  highlight: string | null;

  highlightCat: number | null;
  focusSessions: FocusRecord[];
  liveFocus: FocusSession | null;
  hoverMinute: number | null;
  onHover: (minute: number | null, x?: number, y?: number) => void;
}

export function Dial({ day, catById, now, highlight, highlightCat, focusSessions, liveFocus, hoverMinute, onHover }: Props) {
  const n = day.minutes.length || 1440;
  const angle = (m: number) => (m / n) * TAU - Math.PI / 2;
  const ref = useRef<SVGSVGElement>(null);
  const t = useT();

  const segs = useMemo(() => {
    const out: Seg[] = [];
    let cur: Seg | null = null;
    day.minutes.forEach((v, i) => {
      let s: Omit<Seg, "from" | "to"> | null = null;
      if (v >= 0) {
        const cell = day.cells[v];
        const dim =
          (!!highlight && cell.app !== highlight && cell.domain !== highlight) ||
          (highlightCat !== null && (cell.cat ?? -1) !== highlightCat);
        s = { kind: "cat", cat: cell.cat, dim };
      } else if (v === -2) {
        s = { kind: "afk", cat: null, dim: !!highlight || highlightCat !== null };
      }
      if (cur && s && cur.kind === s.kind && cur.cat === s.cat && cur.dim === s.dim && cur.to === i) {
        cur.to = i + 1;
      } else {
        if (cur) out.push(cur);
        cur = s ? { ...s, from: i, to: i + 1 } : null;
      }
    });
    if (cur) out.push(cur);
    return out;
  }, [day, highlight, highlightCat]);
  const toMin = (t: number) => (t - day.start) / 60_000;

  const nowMin = now !== null ? (now - day.start) / 60_000 : null;
  const focus = day.summary.focus;

  const pointer = (e: PointerEvent<SVGSVGElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = S / rect.width;
    const x = (e.clientX - rect.left) * scale - C;
    const y = (e.clientY - rect.top) * scale - C;
    const d = Math.hypot(x, y);
    if (d < R0 - 26 || d > R1 + 30) {
      onHover(null);
      return;
    }
    let a = Math.atan2(y, x) + Math.PI / 2;
    if (a < 0) a += TAU;
    const m = Math.min(n - 1, Math.floor((a / TAU) * n));
    onHover(m, e.clientX - rect.left, e.clientY - rect.top);
  };

  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 60 : 15;
    const base = hoverMinute ?? Math.floor(nowMin ?? 720);
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (base + step) % n;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (base - step + n) % n;
    if (e.key === "Escape") onHover(null);
    if (next !== null) {
      e.preventDefault();
      const a = angle(next + 0.5);
      const rect = ref.current!.getBoundingClientRect();
      const k = rect.width / S;
      const [px, py] = polar((R0 + R1) / 2, a);
      onHover(next, px * k, py * k);
    }
  };

  const PAD = 0.0022;
  return (
    <svg
      ref={ref}
      className="dial"
      viewBox={`0 0 ${S} ${S}`}
      role="img"
      aria-label={t("dial.aria")}
      tabIndex={0}
      onPointerMove={pointer}
      onPointerLeave={() => onHover(null)}
      onKeyDown={keys}
      onBlur={() => onHover(null)}
    >
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--track)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted)" strokeWidth="1.6" opacity="0.55" />
        </pattern>
        <radialGradient id="dial-glow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="var(--brand)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.06" />
        </radialGradient>
      </defs>

      <circle cx={C} cy={C} r={R1 + 30} fill="url(#dial-glow)" />

      <circle cx={C} cy={C} r={(R0 + R1) / 2} fill="none" stroke="var(--track)" strokeWidth={R1 - R0} />
      <circle cx={C} cy={C} r={R1} fill="none" stroke="var(--line-2)" strokeWidth="1" />
      <circle cx={C} cy={C} r={R0} fill="none" stroke="var(--line-2)" strokeWidth="1" />

      {nowMin !== null && nowMin < n && (
        <path
          d={arc(R0 - 7, angle(nowMin), angle(n) - 0.0001)}
          fill="none"
          stroke="var(--faint)"
          strokeWidth="1.5"
          strokeDasharray="1 5"
          strokeLinecap="round"
        />
      )}

      {segs.map((s, i) => {
        const w = s.to - s.from;
        const pad = w > 3 ? PAD : 0;
        const a0 = angle(s.from) + pad;
        const a1 = angle(s.to) - pad;
        const fill = s.kind === "afk" ? "url(#hatch)" : catColor(s.cat != null ? catById.get(s.cat) : null);
        return (
          <path
            key={i}
            d={sector(R0, R1, a0, Math.max(a1, a0 + 0.0005))}
            fill={fill}
            opacity={s.dim ? 0.16 : 1}
            className="dial-seg"
          />
        );
      })}


      {day.background.map((b, i) => (
        <path
          key={"bg" + i}
          d={sector(R0 - 25, R0 - 17, angle(b.from), Math.max(angle(b.to), angle(b.from) + 0.004))}
          fill={catColor(b.cat != null ? catById.get(b.cat) : null)}
          opacity={highlight && highlight !== b.app ? 0.12 : 0.6}
          className="dial-seg"
        />
      ))}


      {day.calls.map((b, i) => (
        <path
          key={"call" + i}
          d={sector(R0 - 30, R0 - 27, angle(b.from), Math.max(angle(b.to), angle(b.from) + 0.004))}
          fill="var(--ink-2)"
          opacity={highlight && highlight !== b.app ? 0.15 : 0.85}
          className="dial-seg"
        >
          <title>{b.display}</title>
        </path>
      ))}


      {focusSessions.map((f, i) => (
        <path
          key={"fs" + i}
          d={arc(R1 + 3, angle(Math.max(0, toMin(f.start))), angle(Math.min(n, toMin(f.end))))}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity={f.completed ? 0.9 : 0.5}
        >
          <title>{t("dial.focusSession")}</title>
        </path>
      ))}
      {liveFocus && nowMin !== null && (
        <>
          <path d={arc(R1 + 3, angle(Math.max(0, toMin(liveFocus.start))), angle(nowMin))} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
          <path
            d={arc(R1 + 3, angle(nowMin), angle(Math.min(n, toMin(liveFocus.end))))}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="2 5"
            opacity="0.8"
          />
        </>
      )}


      {focus && (
        <path
          d={arc(R0 - 9, angle((focus.start - day.start) / 60_000), angle((focus.end - day.start) / 60_000))}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity={highlight ? 0.3 : 0.95}
        >
          <title>{t("dial.longestStreak")}</title>
        </path>
      )}


      {Array.from({ length: 24 }, (_, h) => {
        const a = angle((h / 24) * n);
        const major = h % 6 === 0;
        const [x0, y0] = polar(R1 + 5, a);
        const [x1, y1] = polar(R1 + (major ? 14 : 9), a);
        const [tx, ty] = polar(R1 + 24, a);
        return (
          <g key={h}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? "var(--ink-2)" : "var(--faint)"} strokeWidth={major ? 2 : 1.2} strokeLinecap="round" />
            {h % 3 === 0 && (
              <text x={tx} y={ty} className={major ? "dial-label major" : "dial-label"} textAnchor="middle" dominantBaseline="central">
                {String(h).padStart(2, "0")}
              </text>
            )}
          </g>
        );
      })}


      {hoverMinute !== null && (
        <line
          x1={polar(R0 - 16, angle(hoverMinute + 0.5))[0]}
          y1={polar(R0 - 16, angle(hoverMinute + 0.5))[1]}
          x2={polar(R1 + 4, angle(hoverMinute + 0.5))[0]}
          y2={polar(R1 + 4, angle(hoverMinute + 0.5))[1]}
          stroke="var(--ink)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}


      {nowMin !== null && nowMin >= 0 && nowMin <= n && (
        <g className="needle">
          <line
            x1={polar(R0 - 22, angle(nowMin))[0]}
            y1={polar(R0 - 22, angle(nowMin))[1]}
            x2={polar(R1 + 12, angle(nowMin))[0]}
            y2={polar(R1 + 12, angle(nowMin))[1]}
            stroke="var(--brand)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx={polar(R1 + 12, angle(nowMin))[0]} cy={polar(R1 + 12, angle(nowMin))[1]} r="5" fill="var(--brand)" stroke="var(--surface)" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}
