

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;

  lead?: ReactNode;

  hint?: string;
  group?: string;
}

interface Props<V extends string | number> {
  value: V;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  ariaLabel: string;
  className?: string;
  size?: "sm" | "md" | "lg";

  searchFrom?: number;
}

const GAP = 6;

export function Select<V extends string | number>({ value, options, onChange, ariaLabel, className = "", size = "md", searchFrom = 12 }: Props<V>) {
  const t = useT();
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const current = options.find((o) => o.value === value);
  const searchable = options.length >= searchFrom;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s) || String(o.group ?? "").toLowerCase().includes(s)) : options;
  }, [options, q]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - GAP - 12;
    const above = r.top - GAP - 12;
    const up = below < 220 && above > below;
    const maxH = Math.min(360, Math.max(140, up ? above : below));
    const width = Math.max(r.width, 200);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ left, top: up ? r.top - GAP : r.bottom + GAP, width, maxH, up });
  };

  const openList = () => {
    setQ("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    place();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const pick = (o: SelectOption<V>) => {
    onChange(o.value);
    close();
  };


  useEffect(() => {
    if (open && !searchable) list.current?.focus({ preventScroll: true });
  }, [open, searchable]);


  useLayoutEffect(() => {
    if (!open) return;
    pop.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, shown]);


  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(false);
    };
    const scroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) close(false);
    };
    const blur = () => close(false);
    window.addEventListener("mousedown", down);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", blur);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", blur);
      window.removeEventListener("blur", blur);
    };
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const n = shown.length;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(n - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home" || e.key === "PageUp") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" || e.key === "PageDown") {
      e.preventDefault();
      setActive(n - 1);
    } else if (e.key === "Enter" || (e.key === " " && !searchable)) {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === "Tab") {
      close(false);
    } else if (!searchable && e.key.length === 1) {

      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`zsel zsel-${size} ${open ? "open" : ""} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
      >
        {current?.lead && <span className="zsel-lead">{current.lead}</span>}
        <span className="zsel-value">{current?.label ?? ""}</span>
        <Icon name="chevDown" size={14} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            className={`zsel-pop ${pos.up ? "up" : ""}`}
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH }}
            onKeyDown={onKey}
          >
            {searchable && (
              <div className="zsel-search">
                <Icon name="search" size={13} />
                <input
                  autoFocus
                  value={q}
                  placeholder={t("select.filter")}
                  onChange={(e) => (setQ(e.target.value), setActive(0))}
                  aria-label={t("select.filter")}
                  aria-controls={id}
                  aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
                />
              </div>
            )}
            <div className="zsel-list" role="listbox" id={id} aria-label={ariaLabel} tabIndex={searchable ? -1 : 0} ref={list} aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}>
              {shown.length === 0 && <div className="zsel-empty">{t("palette.noMatches")}</div>}
              {shown.map((o, i) => {
                const head = o.group !== lastGroup && o.group ? o.group : null;
                lastGroup = o.group;
                const selected = o.value === value;
                return (
                  <div key={String(o.value)}>
                    {head && <div className="zsel-group">{head}</div>}
                    <div
                      id={`${id}-${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={selected}
                      className={`zsel-opt ${i === active ? "active" : ""} ${selected ? "selected" : ""}`}
                      onMouseMove={() => i !== active && setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(o)}
                    >
                      {o.lead && <span className="zsel-lead">{o.lead}</span>}
                      <span className="zsel-label">{o.label}</span>
                      {o.hint && <span className="zsel-hint">{o.hint}</span>}
                      {selected && <Icon name="check" size={14} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
