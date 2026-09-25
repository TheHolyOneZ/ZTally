
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Category } from "../lib/ipc";
import { catColor, useCatName } from "../lib/store";
import { Icon } from "./Icon";


export function Glyph({ label, cat, size = 30, site = false }: { label: string; cat?: Category | null; size?: number; site?: boolean }) {
  const clean = label.replace(/^(www\.)/, "");
  const letters = site
    ? clean.slice(0, 1).toUpperCase()
    : clean
        .split(/[\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("") || "?";
  return (
    <span
      className={site ? "glyph site" : "glyph"}
      style={{ width: size, height: size, ["--g" as string]: catColor(cat), fontSize: size * (letters.length > 1 ? 0.36 : 0.44) }}
      aria-hidden="true"
    >
      {letters}
    </span>
  );
}

export function CatDot({ cat, size = 10 }: { cat?: Category | null; size?: number }) {
  return <span className="cat-dot" style={{ width: size, height: size, background: catColor(cat) }} />;
}

export function CatPill({ cat, onClick, active }: { cat?: Category | null; onClick?: () => void; active?: boolean }) {
  const catName = useCatName();
  const El = onClick ? "button" : "span";
  return (
    <El className={`cat-pill ${active ? "active" : ""}`} onClick={onClick} style={{ ["--g" as string]: catColor(cat) }}>
      <CatDot cat={cat} size={8} />
      {catName(cat)}
    </El>
  );
}

export interface MenuItem {
  label: string;
  icon?: string;
  hint?: string;
  danger?: boolean;
  color?: string;
  run?: () => void;
  children?: MenuItem[];
  heading?: boolean;
}


export function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
    el.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);
  const onKey = (e: React.KeyboardEvent) => {
    const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") btns[(i + 1) % btns.length]?.focus();
    if (e.key === "ArrowUp") btns[(i - 1 + btns.length) % btns.length]?.focus();
  };
  return (
    <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y }} role="menu" onKeyDown={onKey}>
      {items.map((it, i) =>
        it.heading ? (
          <div key={i} className="menu-heading">
            {it.label}
          </div>
        ) : it.label === "-" ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item ${it.danger ? "danger" : ""}`}
            onClick={() => {
              it.run?.();
              onClose();
            }}
          >
            {it.color ? <span className="cat-dot" style={{ background: it.color, width: 9, height: 9 }} /> : it.icon ? <Icon name={it.icon} size={15} /> : <span style={{ width: 15 }} />}
            <span className="grow">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "sm" }) {
  return (
    <div className={`segmented ${size ?? ""}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className={`stat-sub ${tone ?? ""}`}>{sub}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={22} />
      </div>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}
