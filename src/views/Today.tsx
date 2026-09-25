import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BackgroundRow } from "../components/BackgroundRow";
import { Dial } from "../components/Dial";
import { CatDot, CatPill, Empty, Glyph } from "../components/bits";
import { Icon } from "../components/Icon";
import { useActions, type Target } from "../lib/actions";
import { useItemDrag } from "../lib/drag";
import { tourSignal } from "../lib/tour";
import { api, type Category, type DayView, type FocusSession, type LedgerItem } from "../lib/ipc";
import { rich, useT } from "../lib/i18n";
import { catColor, useCatName, useLoader, useStore } from "../lib/store";
import { dayBounds, fmtClock, fmtDur, isSameDay, pct } from "../lib/time";

export function Today() {
  const { date, catById, categories, version, highlight, setHighlight, status } = useStore();
  const t = useT();
  const catName = useCatName();
  const isToday = isSameDay(date, new Date());
  const [start, end] = dayBounds(date);
  const liveFocus = isToday ? status?.focus ?? null : null;
  const day = useLoader(() => api.day(start, end), [start, end, version], isToday ? 20_000 : undefined);
  const sessions = useLoader(() => api.focusHistory(start, end), [start, end, version, !!liveFocus]);
  const [hover, setHover] = useState<{ m: number; x: number; y: number } | null>(null);
  const { assign, openMenu, menuEl } = useActions();
  const { start: startDrag, ghost, overCat: dropCat } = useItemDrag(assign);
  const [hoverCat, setHoverCat] = useState<number | null>(null);
  const [, setTick] = useState(0);


  useEffect(() => {
    if (!isToday) return;
    const timer = setInterval(() => setTick((x) => x + 1), liveFocus ? 1000 : 30_000);
    return () => clearInterval(timer);
  }, [isToday, !!liveFocus]);

  if (!day) return <div className="loading" />;
  const s = day.summary;
  const now = isToday ? Date.now() : null;


  const catTotals = new Map(s.categories.map((c) => [c.id ?? 0, c.ms]));
  const neutral = s.activeMs - s.productiveMs - s.distractingMs;

  return (
    <div className="today">
      <section className="card dial-card">
        <div className="dial-wrap" data-tour="dial">
          <Dial
            day={day}
            catById={catById}
            now={now}
            highlight={highlight}
            highlightCat={hoverCat}
            focusSessions={sessions ?? []}
            liveFocus={liveFocus}
            hoverMinute={hover?.m ?? null}
            onHover={(m, x, y) => {
              setHover(m === null ? null : { m, x: x ?? 0, y: y ?? 0 });
              if (m !== null) tourSignal("dial");
            }}
          />
          <div className="dial-center">
            {liveFocus ? (
              <FocusCenter f={liveFocus} />
            ) : s.activeMs > 0 ? (
              <>
                <div className="dc-label">{t(highlight ? "today.highlighting" : isToday ? "today.activeToday" : "today.active")}</div>
                <div className="dc-total">{highlight ? highlightLabel(day, highlight) : fmtDur(s.activeMs)}</div>
                <div className="dc-split" aria-label={t("today.splitAria")}>
                  <span style={{ flex: s.productiveMs, background: "var(--good)" }} />
                  <span style={{ flex: Math.max(0, neutral), background: "var(--faint)" }} />
                  <span style={{ flex: s.distractingMs, background: "var(--serious)" }} />
                </div>
                <div className="dc-sub">
                  <b>{pct(s.productiveMs, s.activeMs)}%</b> {t("today.focused")} · <b>{pct(s.distractingMs, s.activeMs)}%</b> {t("today.drift")}
                </div>
                {highlight ? (
                  <button className="chip" onClick={() => setHighlight(null)}>
                    <Icon name="x" size={12} /> {t("today.clear")}
                  </button>
                ) : (
                  isToday && <FocusStarter />
                )}
              </>
            ) : (
              <>
                <div className="dc-label">{t(isToday ? "today.warmingUp" : "today.noActivity")}</div>
                <div className="dc-total dim">0m</div>
                <div className="dc-sub">{t(isToday ? (status?.backend.ok ? "today.emptyHint" : "today.unavailable") : "today.nothingRecorded")}</div>
                {isToday && status?.backend.ok && <FocusStarter />}
              </>
            )}
          </div>
          {hover && <Lens day={day} minute={hover.m} x={hover.x} y={hover.y} catById={catById} />}
        </div>

        <div className="legend" data-tour="legend" aria-label={t("today.legendAria")}>
          {categories.map((c) => (
            <div
              key={c.id}
              data-drop-cat={c.id}
              className={`legend-item ${dropCat === c.id ? "drop" : ""} ${hoverCat === c.id ? "hot" : ""}`}
              style={{ ["--g" as string]: catColor(c) }}
              onMouseEnter={() => setHoverCat(c.id)}
              onMouseLeave={() => setHoverCat(null)}
            >
              <CatDot cat={c} />
              <span className="li-name">{catName(c)}</span>
              <span className="li-val">{catTotals.get(c.id) ? fmtDur(catTotals.get(c.id)!) : "·"}</span>
            </div>
          ))}
          {catTotals.get(0) ? (
            <div className="legend-item" style={{ ["--g" as string]: "var(--c0)" }} onMouseEnter={() => setHoverCat(-1)} onMouseLeave={() => setHoverCat(null)}>
              <CatDot />
              <span className="li-name">{catName(null)}</span>
              <span className="li-val">{fmtDur(catTotals.get(0)!)}</span>
            </div>
          ) : null}
        </div>

        <div className="day-facts">
          <Fact label={t("facts.streak")} value={s.focus ? fmtDur(s.focus.ms) : t("facts.none")} sub={s.focus ? t("date.range", { from: fmtClock(s.focus.start), to: fmtClock(s.focus.end) }) : t("facts.streakHint")} accent />
          <Fact label={t("facts.switches")} value={String(s.switches)} sub={s.activeMs > 0 ? t("facts.perHour", { n: (s.switches / Math.max(1, s.activeMs / 3_600_000)).toFixed(0) }) : t("facts.switchesHint")} />
          <Fact label={t("facts.away")} value={fmtDur(s.afkMs)} sub={t("facts.awayHint")} />
          <Fact
            label={t("facts.background")}
            value={fmtDur(s.backgroundMs)}
            sub={s.callMs > 0 ? t("calls.fact", { time: fmtDur(s.callMs) }) : s.backgroundMs > 0 ? t("bg.whileFocused", { pct: pct(s.backgroundFocusMs, s.backgroundMs) }) : t("facts.backgroundHint")}
          />
          <Fact label={t("facts.span")} value={s.firstMs ? fmtClock(s.firstMs) : "--:--"} sub={s.lastMs ? t("facts.until", { time: isToday && now && now - s.lastMs < 120_000 ? t("facts.now") : fmtClock(s.lastMs) }) : t("facts.spanHint")} />
        </div>
      </section>

      <Ledger day={day} onMenu={openMenu} onDragStart={startDrag} />
      {menuEl}
      {ghost}
    </div>
  );
}

function FocusStarter() {
  const { settings, toast } = useStore();
  const t = useT();
  const [open, setOpen] = useState(false);
  const start = async (m: number) => {
    setOpen(false);
    await api.focusStart(m);
    toast(t("focus.started", { min: m }));
  };
  if (!open) {
    return (
      <button className="focus-btn" data-tour="focus" onClick={() => setOpen(true)}>
        <Icon name="bolt" size={13} /> {t("focus.start")}
      </button>
    );
  }
  const presets = [...new Set([25, 50, 90, settings?.focusMinutes ?? 50])].sort((a, b) => a - b);
  return (
    <div className="focus-pop" onMouseLeave={() => setOpen(false)}>
      <div className="focus-pick">
        {presets.map((m) => (
          <button key={m} onClick={() => start(m)}>
            {m}m
          </button>
        ))}
      </div>
      <p className="focus-explain">{t("focus.explain")}</p>
    </div>
  );
}

function FocusCenter({ f }: { f: FocusSession }) {
  const t = useT();
  const left = Math.max(0, f.end - Date.now());
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  const done = 1 - left / f.plannedMs;
  const drifting = f.driftRunMs > 5_000;
  return (
    <>
      <div className="dc-label brand">{t(drifting ? "focus.drifting" : "focus.session")}</div>
      <div className="dc-total mono">
        {mm}:{String(ss).padStart(2, "0")}
      </div>
      <div className="dc-split" aria-label={t("focus.progressAria")}>
        <span style={{ flex: done, background: "var(--brand)" }} />
        <span style={{ flex: 1 - done, background: "var(--track)" }} />
      </div>
      <div className="dc-sub">
        {t("focus.driftSoFar", { time: fmtDur(f.driftMs, { seconds: true }) })}
      </div>
      <button className="chip" onClick={() => api.focusStop()}>
        <Icon name="x" size={12} /> {t("focus.end")}
      </button>
    </>
  );
}

function highlightLabel(day: DayView, key: string): string {
  const item = day.summary.apps.find((a) => a.key === key) ?? day.summary.domains.find((d) => d.key === key);
  return item ? fmtDur(item.ms) : "0m";
}

function Fact({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`fact ${accent ? "accent" : ""}`}>
      <div className="fact-label">{label}</div>
      <div className="fact-value">{value}</div>
      <div className="fact-sub">{sub}</div>
    </div>
  );
}

function Lens({ day, minute, x, y, catById }: { day: DayView; minute: number; x: number; y: number; catById: Map<number, Category> }) {
  const t = useT();
  const bg = day.background.filter((b) => b.from <= minute && minute < b.to);
  const calls = day.calls.filter((b) => b.from <= minute && minute < b.to);
  const v = day.minutes[minute];
  const at = day.start + minute * 60_000;
  const cell = v >= 0 ? day.cells[v] : null;
  const cat = cell?.cat != null ? catById.get(cell.cat) : null;
  const left = x > 280 ? x - 250 : x + 22;
  return (
    <div className="lens" style={{ left, top: Math.max(8, y - 40) }} role="status">
      <div className="lens-time">{fmtClock(at)}</div>
      {cell ? (
        <>
          <div className="lens-app">
            <Glyph label={cell.display} cat={cat} size={22} />
            <b>{cell.display}</b>
          </div>
          {cell.title && <div className="lens-title">{cell.title}</div>}
          <div className="lens-meta">
            <CatPill cat={cat} />
            {cell.domain && <span className="mono dim">{cell.domain}</span>}
          </div>
        </>
      ) : (
        <div className="lens-app dim">{t(v === -2 ? "lens.away" : "lens.nothing")}</div>
      )}
      {calls.map((b) => (
        <div key={"c" + b.app} className="lens-bg">
          <Icon name="mic" size={12} />
          <span>{rich(t("calls.onCallIn"), { app: <b>{b.display}</b> })}</span>
        </div>
      ))}
      {bg.map((b) => (
        <div key={b.app} className="lens-bg">
          <span className="note">♪</span>
          <span>
            <b>{b.display}</b> {t("lens.inBackground")}{b.title ? ` · ${b.title}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

type DragStarter = (t: Target) => (e: ReactPointerEvent) => void;

function Ledger({ day, onMenu, onDragStart }: { day: DayView; onMenu: (t: Target, x: number, y: number) => void; onDragStart: DragStarter }) {
  const { catById, highlight, setHighlight } = useStore();
  const t = useT();
  const [tab, setTab] = useState<"apps" | "sites" | "background">("apps");
  const [open, setOpen] = useState<string | null>(null);
  const items = tab === "apps" ? day.summary.apps : tab === "sites" ? day.summary.domains : day.summary.background;
  const max = items[0]?.ms ?? 1;
  const uncategorised = useMemo(() => items.filter((i) => i.cat == null).length, [items]);

  return (
    <section className="card ledger" data-tour="ledger">
      <header className="ledger-head">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "apps"} className={tab === "apps" ? "on" : ""} onClick={() => setTab("apps")}>
            {t("ledger.apps")} <span className="count">{day.summary.apps.length}</span>
          </button>
          <button role="tab" aria-selected={tab === "sites"} className={tab === "sites" ? "on" : ""} onClick={() => setTab("sites")}>
            {t("ledger.sites")} <span className="count">{day.summary.domains.length}</span>
          </button>
          <button role="tab" aria-selected={tab === "background"} className={tab === "background" ? "on" : ""} onClick={() => setTab("background")} title={t("ledger.backgroundHint")}>
            ♪ {t("ledger.background")} <span className="count">{day.summary.background.length + day.summary.calls.length}</span>
          </button>
        </div>
        {uncategorised > 0 && <span className="hint-badge" title={t("ledger.toSortHint")}>{t("ledger.toSort", { count: uncategorised })}</span>}
      </header>

      {tab === "background" && items.length + day.summary.calls.length > 0 && (
        <p className="ledger-note">{t("ledger.backgroundNote")}</p>
      )}
      {(tab === "background" ? items.length + day.summary.calls.length === 0 : items.length === 0) ? (
        <Empty icon={tab === "apps" ? "today" : tab === "sites" ? "puzzle" : "music"} title={t(`ledger.empty.${tab}.title`)}>
          {t(`ledger.empty.${tab}.body`)}
        </Empty>
      ) : (
        <ol className="ledger-list">
          {tab === "background" && day.summary.calls.length > 0 && (
            <>
              <li className="ledger-sub">
                <Icon name="mic" size={13} /> {t("calls.heading")}
              </li>
              {day.summary.calls.map((it) => (
                <BackgroundRow key={"call" + it.key} item={it} total={day.summary.callMs} onMenu={(x, y) => onMenu({ kind: "app", key: it.key, label: it.label, cat: it.cat, mixed: false }, x, y)} />
              ))}
              {day.summary.background.length > 0 && (
                <li className="ledger-sub">
                  ♪ {t("calls.otherAudio")}
                </li>
              )}
            </>
          )}
          {tab === "background"
            ? day.summary.background.map((it) => (
                <BackgroundRow
                  key={it.key}
                  item={it}
                  total={day.summary.backgroundMs}
                  onMenu={(x, y) => onMenu({ kind: it.via ? "domain" : "app", key: it.key, label: it.label, cat: it.cat, mixed: false }, x, y)}
                />
              ))
            : items.map((it, i) => (
            <LedgerRow
              key={it.key}
              rank={i + 1}
              item={it}
              kind={tab === "sites" ? "domain" : "app"}
              cat={it.cat != null ? catById.get(it.cat) : null}
              max={max}
              total={day.summary.activeMs}
              expanded={open === it.key}
              highlighted={highlight === it.key}
              onToggle={() => setOpen(open === it.key ? null : it.key)}
              onHighlight={() => setHighlight(highlight === it.key ? null : it.key)}
              onMenu={onMenu}
              onDragStart={onDragStart}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function LedgerRow(p: {
  rank: number;
  item: LedgerItem;
  kind: "app" | "domain";
  cat: Category | null | undefined;
  max: number;
  total: number;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onHighlight: () => void;
  onMenu: (t: Target, x: number, y: number) => void;
  onDragStart?: DragStarter;
}) {
  const { item, cat } = p;
  const t = useT();
  const catName = useCatName();
  const target: Target = { kind: p.kind, key: item.key, label: item.label, cat: item.cat, mixed: item.mixed };
  return (
    <li
      className={`lrow ${p.highlighted ? "hl" : ""} ${p.expanded ? "open" : ""}`}
      onPointerDown={p.onDragStart?.(target)}
      onContextMenu={(e) => {
        e.preventDefault();
        p.onMenu(target, e.clientX, e.clientY);
      }}
    >
      <div className="lrow-main" onClick={p.onHighlight} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), p.onHighlight())} aria-pressed={p.highlighted}>
        <Glyph label={item.label} cat={cat} site={p.kind === "domain"} />
        <div className="lrow-text">
          <div className="lrow-name">{item.label}</div>
          <div className="lrow-bar">
            <span style={{ width: `${Math.max(2, (item.ms / p.max) * 100)}%`, background: item.mixed ? "var(--ink-2)" : catColor(cat) }} />
          </div>
        </div>
        <div className="lrow-nums">
          <div className="lrow-dur">{fmtDur(item.ms)}</div>
          <div className="lrow-pct">{pct(item.ms, p.total)}%</div>
        </div>
      </div>
      <div className="lrow-actions">
        <button
          className={`cat-chip ${item.mixed ? "mixed" : cat ? "" : "unsorted"}`}
          style={{ ["--g" as string]: item.mixed ? "var(--faint)" : catColor(cat) }}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            p.onMenu(target, r.left, r.bottom + 4);
          }}
          title={t(item.mixed ? "ledger.mixedHint" : "ledger.changeCategory")}
        >
          {item.mixed ? t("ledger.mixed") : cat ? catName(cat) : t("ledger.sortMe")}
        </button>
        {item.titles.length > 0 && (
          <button className="icon-btn" onClick={p.onToggle} aria-expanded={p.expanded} aria-label={t("ledger.showTitles")}>
            <Icon name={p.expanded ? "x" : "week"} size={14} />
          </button>
        )}
      </div>
      {p.expanded && (
        <ul className="titles">
          {item.titles.map(([title, ms]) => (
            <li key={title}>
              <span className="t">{title}</span>
              <span className="mono dim">{fmtDur(ms)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
