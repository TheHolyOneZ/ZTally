import { useState } from "react";
import { CatDot, Empty, Glyph, Stat } from "../components/bits";
import { DuringBar } from "../components/BackgroundRow";
import { useActions } from "../lib/actions";
import { api, type Category, type RangeView } from "../lib/ipc";
import { useT } from "../lib/i18n";
import { catColor, useCatName, useLoader, useStore } from "../lib/store";
import { addDays, fmtClock, fmtDur, fmtWeekday, HOUR, pct, startOfWeek, weekDays } from "../lib/time";

export function useWeeks() {
  const { date, settings, version } = useStore();
  const monday = settings?.weekStartsMonday ?? true;
  const ws = startOfWeek(date, monday);
  const days = weekDays(ws);
  const prevDays = weekDays(addDays(ws, -7));
  const data = useLoader(async () => {
    const [cur, prev] = await Promise.all([api.range(days), api.range(prevDays)]);
    return { cur, prev };
  }, [days[0][0], version], 60_000);
  return { ws, days, data };
}

export function Delta({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  const t = useT();
  if (before <= 0) return <span className="dim">{t("week.noDataLast")}</span>;
  const d = Math.round(((now - before) / before) * 100);
  if (d === 0) return <span className="dim">{t("week.same")}</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={good ? "delta good" : "delta bad"}>
      {d > 0 ? "▲" : "▼"} {t("week.vsLast", { pct: Math.abs(d) })}
    </span>
  );
}

export function Week() {
  const { catById, categories, setDate, setView } = useStore();
  const t = useT();
  const catName = useCatName();
  const { data } = useWeeks();
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);
  const { openMenu, menuEl } = useActions();

  if (!data) return <div className="loading" />;
  const { cur, prev } = data;
  const s = cur.summary;
  const activeDays = cur.days.filter((d) => d.activeMs > 0).length || 1;
  const maxDay = Math.max(...cur.days.map((d) => d.activeMs), 1);
  const bestDay = cur.days.reduce((a, b) => (b.activeMs > a.activeMs ? b : a), cur.days[0]);

  if (s.activeMs === 0 && prev.summary.activeMs === 0) {
    return (
      <div className="card pad">
        <Empty icon="week" title={t("week.emptyTitle")}>
          {t("week.emptyBody")}
        </Empty>
      </div>
    );
  }

  return (
    <div className="week">
      <div className="stats-row">
        <Stat label={t("week.active")} value={fmtDur(s.activeMs)} sub={<Delta now={s.activeMs} before={prev.summary.activeMs} invert />} />
        <Stat label={t("week.average")} value={fmtDur(s.activeMs / activeDays)} sub={t("week.activeDays", { count: activeDays })} />
        <Stat
          label={t("week.focusedShare")}
          value={`${pct(s.productiveMs, s.activeMs)}%`}
          sub={<Delta now={pct(s.productiveMs, s.activeMs)} before={pct(prev.summary.productiveMs, prev.summary.activeMs)} />}
        />
        <Stat
          label={t("week.bestStreak")}
          value={s.focus ? fmtDur(s.focus.ms) : t("facts.none")}
          sub={s.focus ? `${fmtWeekday(s.focus.start)} ${fmtClock(s.focus.start)}` : t("facts.streakHint")}
        />
      </div>

      <section className="card ribbon-card">
        <header className="card-head">
          <h2>{t("week.ribbon")}</h2>
          <span className="dim">{t("week.ribbonHint")}</span>
        </header>
        <div className="ribbon" onMouseLeave={() => setTip(null)}>
          <div className="ribbon-axis">
            <span />
            <div className="axis-hours">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i}>{String(i * 3).padStart(2, "0")}</span>
              ))}
            </div>
            <span />
          </div>
          {cur.days.map((d) => (
            <div key={d.start} className="ribbon-row">
              <button
                className="ribbon-day"
                onClick={() => {
                  setDate(new Date(d.start));
                  setView("today");
                }}
                title={t("week.openDay")}
              >
                <b>{fmtWeekday(d.start)}</b>
                <span>{new Date(d.start).getDate()}</span>
              </button>
              <div className="ribbon-cells">
                {d.hours.map((h, i) => {
                  const cat = h.cat != null ? catById.get(h.cat) : null;
                  const intensity = Math.min(1, h.activeMs / HOUR);
                  return (
                    <span
                      key={i}
                      className={h.activeMs > 0 ? "rc filled" : "rc"}
                      style={h.activeMs > 0 ? { background: catColor(cat), opacity: 0.22 + 0.78 * intensity } : undefined}
                      onMouseEnter={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const host = (e.currentTarget.closest(".ribbon") as HTMLElement).getBoundingClientRect();
                        setTip({
                          x: r.left - host.left + r.width / 2,
                          y: r.top - host.top,
                          text: `${fmtWeekday(d.start)} ${t("date.range", { from: `${String(i).padStart(2, "0")}:00`, to: `${String(i + 1).padStart(2, "0")}:00` })}`,
                          sub: h.activeMs > 0 ? t("week.cellTip", { time: fmtDur(h.activeMs), category: catName(cat) }) : t("lens.nothing"),
                        });
                      }}
                    />
                  );
                })}
              </div>
              <div className="ribbon-total">
                <div className="stack" style={{ width: `${(d.activeMs / maxDay) * 100}%` }}>
                  {d.categories.map((c) => (
                    <span key={c.id ?? 0} style={{ flex: c.ms, background: catColor(c.id != null ? catById.get(c.id) : null) }} />
                  ))}
                </div>
                <span className={d === bestDay && d.activeMs > 0 ? "mono strong" : "mono"}>{d.activeMs > 0 ? fmtDur(d.activeMs) : "·"}</span>
              </div>
            </div>
          ))}
          {tip && (
            <div className="tip" style={{ left: tip.x, top: tip.y }}>
              <b>{tip.text}</b>
              <span>{tip.sub}</span>
            </div>
          )}
        </div>
      </section>

      <div className="week-grid">
        <section className="card">
          <header className="card-head">
            <h2>{t("week.categories")}</h2>
            <span className="dim">{t("week.categoriesHint")}</span>
          </header>
          <CategoryCompare cur={cur} prev={prev} categories={categories} />
        </section>
        <section className="card">
          <header className="card-head">
            <h2>{t("week.top")}</h2>
            <span className="dim">{t("week.topHint")}</span>
          </header>
          <TopList cur={cur} catById={catById} onMenu={openMenu} />
        </section>
      </div>
      {menuEl}
    </div>
  );
}

function CategoryCompare({ cur, prev, categories }: { cur: RangeView; prev: RangeView; categories: Category[] }) {
  const t = useT();
  const catName = useCatName();
  const get = (r: RangeView, id: number | null) => r.summary.categories.find((c) => c.id === id)?.ms ?? 0;
  const rows = [...categories.map((c) => ({ id: c.id as number | null, cat: c as Category | null })), { id: null, cat: null }]
    .map((r) => ({ ...r, now: get(cur, r.id), before: get(prev, r.id) }))
    .filter((r) => r.now > 0 || r.before > 0)
    .sort((a, b) => b.now - a.now);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.now, r.before)));
  return (
    <ul className="compare">
      {rows.map((r) => {
        const d = r.before > 0 ? Math.round(((r.now - r.before) / r.before) * 100) : null;
        const bad = r.cat?.kind === "distracting" ? (d ?? 0) > 0 : r.cat?.kind === "productive" ? (d ?? 0) < 0 : false;
        return (
          <li key={r.id ?? 0}>
            <span className="cmp-name">
              <CatDot cat={r.cat} /> {catName(r.cat)}
            </span>
            <span className="cmp-bars">
              <span className="ghost" style={{ width: `${(r.before / max) * 100}%` }} />
              <span className="bar" style={{ width: `${(r.now / max) * 100}%`, background: catColor(r.cat) }} />
            </span>
            <span className="mono">{fmtDur(r.now)}</span>
            <span className={`cmp-delta ${d === null ? "dim" : bad ? "bad" : "good"}`}>{d === null ? t("week.new") : `${d > 0 ? "+" : ""}${d}%`}</span>
          </li>
        );
      })}
    </ul>
  );
}

function TopList({ cur, catById, onMenu }: { cur: RangeView; catById: Map<number, Category>; onMenu: ReturnType<typeof useActions>["openMenu"] }) {
  const t = useT();
  const apps = cur.summary.apps.slice(0, 6);
  const sites = cur.summary.domains.slice(0, 6);
  const background = cur.summary.background.slice(0, 4);
  const total = cur.summary.activeMs;
  const row = (kind: "app" | "domain") => (it: (typeof apps)[number]) => {
    const cat = it.cat != null ? catById.get(it.cat) : null;
    return (
      <li
        key={kind + it.key}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu({ kind, key: it.key, label: it.label, cat: it.cat }, e.clientX, e.clientY);
        }}
      >
        <Glyph label={it.label} cat={it.mixed ? null : cat} size={24} site={kind === "domain"} />
        <span className="grow ellipsis">{it.label}</span>
        <span className="mono dim">{pct(it.ms, total)}%</span>
        <span className="mono">{fmtDur(it.ms)}</span>
      </li>
    );
  };
  return (
    <div className="toplists">
      <ul>{apps.map(row("app"))}</ul>
      {sites.length > 0 && (
        <>
          <div className="sub-head">{t("ledger.sites")}</div>
          <ul>{sites.map(row("domain"))}</ul>
        </>
      )}
      {background.length > 0 && (
        <>
          <div className="sub-head">♪ {t("week.backgroundHead")}</div>
          <ul className="bg-list">
            {background.map((it) => (
              <li key={"bg" + it.key} className="bg-week">
                <Glyph label={it.label} cat={it.cat != null ? catById.get(it.cat) : null} size={24} site={!!it.via} />
                <span className="grow bg-week-text">
                  <span className="ellipsis">{it.label}</span>
                  <DuringBar item={it} />
                </span>
                <span className="mono">{fmtDur(it.ms)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
