
import { useMemo, useState } from "react";
import { CatDot, Glyph, Segmented, Stat } from "../components/bits";
import { Icon } from "../components/Icon";
import { currentLocale, useT } from "../lib/i18n";
import { api, type DayTotal, type RangeView } from "../lib/ipc";
import { catColor, useCatName, useLoader, useStore } from "../lib/store";
import { addDays, dayBounds, fmtDur, HOUR, isSameDay, pct, startOfDay, startOfWeek } from "../lib/time";

type Mode = "month" | "year";

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}


function daysBetween(from: Date, to: Date): [number, number][] {
  const out: [number, number][] = [];
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) out.push(dayBounds(d));
  return out;
}

function weekdayNames(mondayFirst: boolean): string[] {

  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, (mondayFirst ? 1 : 0) + i).toLocaleDateString(currentLocale(), { weekday: "short" }),
  );
}

interface Tip {
  x: number;
  y: number;
  day: DayTotal;
}

export function Calendar() {
  const t = useT();
  const { date, setDate } = useStore();
  const [mode, setMode] = useState<Mode>("month");
  const anchor = mode === "month" ? monthStart(date) : new Date(date.getFullYear(), 0, 1);
  const next = mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) : new Date(anchor.getFullYear() + 1, 0, 1);
  const prev = mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1) : new Date(anchor.getFullYear() - 1, 0, 1);
  const isCurrent = anchor.getTime() === (mode === "month" ? monthStart(new Date()) : new Date(new Date().getFullYear(), 0, 1)).getTime();
  const label =
    mode === "month"
      ? anchor.toLocaleDateString(currentLocale(), { month: "long", year: "numeric" })
      : String(anchor.getFullYear());

  return (
    <div className="calendar">
      <div className="cal-head">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "month", label: t("calendar.month") },
            { value: "year", label: t("calendar.year") },
          ]}
        />
        <div className="datenav">
          <button className="icon-btn" onClick={() => setDate(prev)} aria-label={t("calendar.prev")}>
            <Icon name="left" size={16} />
          </button>
          <span className="datenav-label">{label}</span>
          <button className="icon-btn" disabled={isCurrent} onClick={() => setDate(next)} aria-label={t("calendar.next")}>
            <Icon name="right" size={16} />
          </button>
          {!isCurrent && (
            <button className="chip" onClick={() => setDate(new Date())}>
              {t(mode === "month" ? "calendar.thisMonth" : "calendar.thisYear")}
            </button>
          )}
        </div>
      </div>
      {mode === "month" ? <MonthView start={anchor} end={next} /> : <YearView year={anchor.getFullYear()} />}
    </div>
  );
}

function useRange(from: Date, to: Date) {
  const { version } = useStore();
  const days = useMemo(() => daysBetween(from, to), [from.getTime(), to.getTime()]);
  return { days, data: useLoader(() => api.range(days), [from.getTime(), to.getTime(), version], 60_000) };
}

function Summary({ r, periodKey }: { r: RangeView; periodKey: "month" | "year" }) {
  const t = useT();
  const s = r.summary;
  const active = r.days.filter((d) => d.activeMs > 0);
  const best = active.reduce<DayTotal | null>((a, b) => (!a || b.activeMs > a.activeMs ? b : a), null);
  return (
    <div className="stats-row">
      <Stat label={t(`calendar.total.${periodKey}`)} value={fmtDur(s.activeMs)} sub={t("week.activeDays", { count: active.length })} />
      <Stat label={t("calendar.perActiveDay")} value={fmtDur(s.activeMs / Math.max(1, active.length))} sub={t("calendar.awayTotal", { time: fmtDur(s.afkMs) })} />
      <Stat label={t("week.focusedShare")} value={`${pct(s.productiveMs, s.activeMs)}%`} sub={t("calendar.driftShare", { pct: pct(s.distractingMs, s.activeMs) })} />
      <Stat
        label={t("calendar.biggestDay")}
        value={best ? fmtDur(best.activeMs) : "·"}
        sub={best ? new Date(best.start).toLocaleDateString(currentLocale(), { weekday: "short", day: "numeric", month: "short" }) : t("facts.none")}
      />
    </div>
  );
}

function DayTip({ tip }: { tip: Tip }) {
  const t = useT();
  const { catById } = useStore();
  const catName = useCatName();
  const d = tip.day;
  return (
    <div className="tip cal-tip" style={{ left: tip.x, top: tip.y }}>
      <b>{new Date(d.start).toLocaleDateString(currentLocale(), { weekday: "long", day: "numeric", month: "long" })}</b>
      {d.activeMs > 0 ? (
        <>
          <span>{t("calendar.activeAway", { active: fmtDur(d.activeMs), away: fmtDur(d.afkMs) })}</span>
          {d.categories.slice(0, 3).map((c) => {
            const cat = c.id != null ? catById.get(c.id) : null;
            return (
              <span key={c.id ?? 0} className="cal-tip-row">
                <CatDot cat={cat} size={8} /> {catName(cat)} · {fmtDur(c.ms)}
              </span>
            );
          })}
        </>
      ) : (
        <span>{t("lens.nothing")}</span>
      )}
    </div>
  );
}

function MonthView({ start, end }: { start: Date; end: Date }) {
  const t = useT();
  const { settings, catById, setDate, setView } = useStore();
  const catName = useCatName();
  const monday = settings?.weekStartsMonday ?? true;
  const { data } = useRange(start, end);
  const [tip, setTip] = useState<Tip | null>(null);

  const gridStart = startOfWeek(start, monday);
  const cells = useMemo(() => {
    const out: Date[] = [];
    for (let d = gridStart; d < end || out.length % 7 !== 0; d = addDays(d, 1)) out.push(d);
    return out;
  }, [gridStart.getTime(), end.getTime()]);

  if (!data) return <div className="loading" />;
  const byStart = new Map(data.days.map((d) => [d.start, d]));
  const max = Math.max(HOUR, ...data.days.map((d) => d.activeMs));
  const today = new Date();

  return (
    <>
      <Summary r={data} periodKey="month" />
      <div className="cal-layout">
        <section className="card month" onMouseLeave={() => setTip(null)}>
          <div className="month-head">
            {weekdayNames(monday).map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="month-grid">
            {cells.map((d) => {
              const inMonth = d.getMonth() === start.getMonth();
              const day = byStart.get(d.getTime());
              const future = d > today;
              const intensity = day ? day.activeMs / max : 0;
              return (
                <button
                  key={d.getTime()}
                  className={`mcell ${inMonth ? "" : "out"} ${isSameDay(d, today) ? "is-today" : ""} ${future ? "future" : ""}`}
                  disabled={!inMonth || future}
                  style={{ ["--i" as string]: intensity.toFixed(3) }}
                  onClick={() => {
                    setDate(d);
                    setView("today");
                  }}
                  onMouseEnter={(e) => {
                    if (!day || !inMonth) return setTip(null);
                    const r = e.currentTarget.getBoundingClientRect();
                    const host = (e.currentTarget.closest(".month") as HTMLElement).getBoundingClientRect();
                    setTip({ x: r.left - host.left + r.width / 2, y: r.top - host.top, day });
                  }}
                >
                  <span className="mcell-date">{d.getDate()}</span>
                  {day && day.activeMs > 0 && inMonth && (
                    <>
                      <span className="mcell-total mono">{fmtDur(day.activeMs)}</span>
                      <span className="mcell-bar">
                        {day.categories.map((c) => (
                          <span key={c.id ?? 0} style={{ flex: c.ms, background: catColor(c.id != null ? catById.get(c.id) : null) }} />
                        ))}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {tip && <DayTip tip={tip} />}
        </section>
        <section className="card">
          <header className="card-head">
            <h2>{t("week.categories")}</h2>
          </header>
          <ul className="cal-cats">
            {data.summary.categories.map((c) => {
              const cat = c.id != null ? catById.get(c.id) : null;
              return (
                <li key={c.id ?? 0}>
                  <CatDot cat={cat} />
                  <span className="grow">{catName(cat)}</span>
                  <span className="mono dim">{pct(c.ms, data.summary.activeMs)}%</span>
                  <span className="mono">{fmtDur(c.ms)}</span>
                </li>
              );
            })}
          </ul>
          <div className="sub-head pad-x">{t("ledger.apps")}</div>
          <ul className="cal-cats">
            {data.summary.apps.slice(0, 6).map((a) => (
              <li key={a.key}>
                <Glyph label={a.label} cat={a.mixed || a.cat == null ? null : catById.get(a.cat)} size={22} />
                <span className="grow ellipsis">{a.label}</span>
                <span className="mono">{fmtDur(a.ms)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function YearView({ year }: { year: number }) {
  const t = useT();
  const { settings, setDate, setView } = useStore();
  const monday = settings?.weekStartsMonday ?? true;
  const start = new Date(year, 0, 1);
  const end = new Date(Math.min(new Date(year + 1, 0, 1).getTime(), addDays(new Date(), 1).getTime()));
  const { data } = useRange(start, end > start ? end : addDays(start, 1));
  const [tip, setTip] = useState<Tip | null>(null);
  if (!data) return <div className="loading" />;
  const byStart = new Map(data.days.map((d) => [d.start, d]));
  const max = Math.max(HOUR, ...data.days.map((d) => d.activeMs));

  const step = (ms: number) => (ms <= 0 ? 0 : Math.min(5, Math.ceil((ms / max) * 5)));

  return (
    <>
      <Summary r={data} periodKey="year" />
      <section className="card year" onMouseLeave={() => setTip(null)}>
        <div className="year-grid">
          {Array.from({ length: 12 }, (_, m) => {
            const first = new Date(year, m, 1);
            const last = new Date(year, m + 1, 1);
            const lead = (first.getDay() - (monday ? 1 : 0) + 7) % 7;
            const total = data.days.filter((d) => d.start >= first.getTime() && d.start < last.getTime()).reduce((a, d) => a + d.activeMs, 0);
            return (
              <div key={m} className="ymonth">
                <div className="ymonth-head">
                  <b>{first.toLocaleDateString(currentLocale(), { month: "long" })}</b>
                  <span className="mono dim">{total > 0 ? fmtDur(total) : ""}</span>
                </div>
                <div className="ymonth-grid">
                  {Array.from({ length: lead }, (_, i) => (
                    <span key={"l" + i} />
                  ))}
                  {daysBetween(first, last).map(([s]) => {
                    const day = byStart.get(s);
                    return (
                      <button
                        key={s}
                        className={`ycell s${step(day?.activeMs ?? 0)} ${isSameDay(new Date(s), new Date()) ? "is-today" : ""}`}
                        disabled={!day}
                        aria-label={new Date(s).toLocaleDateString(currentLocale())}
                        onClick={() => {
                          setDate(new Date(s));
                          setView("today");
                        }}
                        onMouseEnter={(e) => {
                          if (!day) return setTip(null);
                          const r = e.currentTarget.getBoundingClientRect();
                          const host = (e.currentTarget.closest(".year") as HTMLElement).getBoundingClientRect();
                          setTip({ x: r.left - host.left + r.width / 2, y: r.top - host.top, day });
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="year-legend">
          <span className="dim small">{t("calendar.less")}</span>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`ycell s${i}`} />
          ))}
          <span className="dim small">{t("calendar.more")}</span>
        </div>
        {tip && <DayTip tip={tip} />}
      </section>
    </>
  );
}
