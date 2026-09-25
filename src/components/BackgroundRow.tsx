

import { useState } from "react";
import { useT } from "../lib/i18n";
import type { BackgroundItem, Category } from "../lib/ipc";
import { catColor, useCatName, useStore } from "../lib/store";
import { fmtDur, pct } from "../lib/time";
import { Glyph } from "./bits";
import { Icon } from "./Icon";

export function DuringBar({ item }: { item: BackgroundItem }) {
  const { catById } = useStore();
  const catName = useCatName();
  const t = useT();
  return (
    <div className="during-bar" role="img" aria-label={t("bg.duringAria")}>
      {item.during.map(([id, ms]) => {
        const cat = id != null ? catById.get(id) : null;
        return <span key={id ?? 0} style={{ flex: ms, background: catColor(cat) }} title={`${catName(cat)} · ${fmtDur(ms)}`} />;
      })}
      {item.awayMs > 0 && <span className="away" style={{ flex: item.awayMs }} title={`${t("bg.away")} · ${fmtDur(item.awayMs)}`} />}
    </div>
  );
}

export function duringSummary(item: BackgroundItem, catById: Map<number, Category>, catName: (c: Category | null | undefined) => string, t: ReturnType<typeof useT>) {
  const [top] = item.during;
  if (!top || item.awayMs > top[1]) return t("bg.mostlyAway", { time: fmtDur(item.awayMs) });
  const cat = top[0] != null ? catById.get(top[0]) : null;
  return t("bg.mostlyDuring", { category: catName(cat), time: fmtDur(top[1]) });
}

export function BackgroundRow({ item, total, onMenu }: { item: BackgroundItem; total: number; onMenu: (x: number, y: number) => void }) {
  const { catById } = useStore();
  const catName = useCatName();
  const t = useT();
  const [open, setOpen] = useState(false);
  const cat = item.cat != null ? catById.get(item.cat) : null;
  return (
    <li
      className={`lrow bgrow ${open ? "open" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <div className="lrow-main" onClick={() => item.titles.length > 0 && setOpen(!open)} role={item.titles.length > 0 ? "button" : undefined} aria-expanded={item.titles.length > 0 ? open : undefined}>
        <Glyph label={item.label} cat={cat} site={!!item.via} />
        <div className="lrow-text">
          <div className="lrow-name">
            {item.label}
            {item.via && <span className="bg-via">{t("bg.in", { browser: item.via })}</span>}
          </div>
          <DuringBar item={item} />
          <div className="bg-sub">{duringSummary(item, catById, catName, t)}</div>
        </div>
        <div className="lrow-nums">
          <div className="lrow-dur">{fmtDur(item.ms)}</div>
          <div className="lrow-pct">{pct(item.ms, total)}%</div>
        </div>
        {item.titles.length > 0 && <Icon name={open ? "x" : "week"} size={14} />}
      </div>
      {open && (
        <ul className="titles">
          {item.titles.map(([title, ms]) => (
            <li key={title}>
              <span className="t">♪ {title}</span>
              <span className="mono dim">{fmtDur(ms)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
