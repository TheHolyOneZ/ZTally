

import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { api, type FocusRecord, type LedgerItem, type RangeView } from "../lib/ipc";
import { useStore } from "../lib/store";
import { fmtDur } from "../lib/time";
import { Glyph } from "./bits";
import { Icon } from "./Icon";

interface Report {
  rec: FocusRecord;
  range: RangeView;
}

export function FocusReport() {
  const { status, catById, toast } = useStore();
  const t = useT();
  const prev = useRef(status?.focus ?? null);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    const was = prev.current;
    const now = status?.focus ?? null;
    prev.current = now;
    if (!was || now) return;

    (async () => {
      const recs = await api.focusHistory(was.start, Date.now() + 1000);
      const rec = recs.find((r) => r.start === was.start);
      if (!rec || rec.end - rec.start < 60_000) return;
      const range = await api.range([[rec.start, rec.end]]);
      setReport({ rec, range });
    })().catch(() => {});
  }, [status?.focus]);

  if (!report) return null;
  const { rec, range } = report;
  const s = range.summary;
  const length = rec.end - rec.start;
  const onTask = Math.max(0, Math.min(100, Math.round(((length - rec.driftMs) / length) * 100)));
  const kind = (it: LedgerItem) => (it.cat != null ? catById.get(it.cat)?.kind : undefined);
  const worked = s.apps.filter((a) => a.mixed || kind(a) !== "distracting").slice(0, 3);
  const pulled = [...s.domains, ...s.apps.filter((a) => !a.mixed)]
    .filter((i) => kind(i) === "distracting")
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3);
  const minutes = Math.round(rec.plannedMs / 60_000);

  return (
    <div className="modal-backdrop" onMouseDown={() => setReport(null)}>
      <div className="modal focus-report" role="dialog" aria-label={t("focusReport.title")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="fr-top">
          <div>
            <div className="fr-kicker">
              <Icon name="bolt" size={14} /> {t("focusReport.title")}
            </div>
            <div className="fr-sub">{t(rec.completed ? "focusReport.completed" : "focusReport.endedEarly", { time: fmtDur(length) })}</div>
          </div>
          <div className={`fr-score ${onTask >= 85 ? "good" : onTask >= 60 ? "ok" : "bad"}`}>
            <b>{onTask}%</b>
            <span>{t("focusReport.onTask")}</span>
          </div>
        </div>
        <div className="fr-cols">
          <div>
            <h3>{t("focusReport.workedIn")}</h3>
            {worked.length ? (
              worked.map((a) => (
                <div key={a.key} className="fr-row">
                  <Glyph label={a.label} cat={a.mixed || a.cat == null ? null : catById.get(a.cat)} size={22} />
                  <span className="grow ellipsis">{a.label}</span>
                  <span className="mono">{fmtDur(a.ms)}</span>
                </div>
              ))
            ) : (
              <p className="dim small">{t("focusReport.nothing")}</p>
            )}
          </div>
          <div>
            <h3>{t("focusReport.pulledAway")}</h3>
            {pulled.length ? (
              pulled.map((a) => (
                <div key={a.key} className="fr-row">
                  <Glyph label={a.label} cat={a.cat != null ? catById.get(a.cat) : null} size={22} site={a.key.includes(".")} />
                  <span className="grow ellipsis">{a.label}</span>
                  <span className="mono">{fmtDur(a.ms)}</span>
                </div>
              ))
            ) : (
              <p className="fr-clean">
                <Icon name="check" size={14} /> {t("focusReport.clean")}
              </p>
            )}
          </div>
        </div>
        <div className="fr-actions">
          <button className="btn ghost" onClick={() => setReport(null)}>
            {t("focusReport.done")}
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              setReport(null);
              await api.focusStart(minutes);
              toast(t("focus.started", { min: minutes }));
            }}
          >
            <Icon name="bolt" size={15} /> {t("focusReport.again", { min: minutes })}
          </button>
        </div>
      </div>
    </div>
  );
}
