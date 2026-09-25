import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useState, type ReactNode } from "react";
import { Segmented, Toggle } from "../components/bits";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { LANGUAGES, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../lib/store";
import { STYLES } from "../lib/styles";
import { addDays, dayBounds, fmtShortDate } from "../lib/time";
import { DayPicker } from "./Report";

function Row({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <div className="set-title">{title}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function ChipList({ items, onRemove }: { items: string[]; onRemove: (s: string) => void }) {
  const t = useT();
  const [all, setAll] = useState(false);
  if (items.length === 0) return <span className="dim small">{t("settings.none")}</span>;
  const shown = all ? items : items.slice(0, 6);
  return (
    <div className="chips">
      {items.length > 6 && (
        <button className="chip more" onClick={() => setAll(!all)}>
          {all ? t("settings.showLess") : t("settings.more", { n: items.length - 6 })}
        </button>
      )}
      {shown.map((i) => (
        <span key={i} className="chip">
          {i}
          <button onClick={() => onRemove(i)} aria-label={t("settings.remove", { item: i })}>
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}

function AddChip({ placeholder, onAdd }: { placeholder: string; onAdd: (s: string) => void }) {
  const t = useT();
  const [v, setV] = useState("");
  return (
    <form
      className="row gap"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onAdd(v.trim().toLowerCase());
        setV("");
      }}
    >
      <input className="input sm" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
      <button className="btn sm" type="submit">
        {t("rules.add")}
      </button>
    </form>
  );
}


export function StylePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const t = useT();
  return (
    <div className="style-grid" role="radiogroup" aria-label={t("settings.style")}>
      {STYLES.map((s) => (
        <button
          key={s.id}
          role="radio"
          aria-checked={value === s.id}
          className={`style-card ${value === s.id ? "on" : ""}`}
          style={{ ["--sp" as string]: s.preview.page, ["--ss" as string]: s.preview.surface, ["--sa" as string]: s.preview.accent }}
          onClick={() => onChange(s.id)}
        >
          <span className="style-swatch" aria-hidden="true">
            <svg viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="13" fill="none" stroke="var(--ss)" strokeWidth="6" />
              <circle cx="20" cy="20" r="13" fill="none" stroke="var(--sa)" strokeWidth="6" strokeDasharray="30 100" transform="rotate(-90 20 20)" strokeLinecap="round" />
              <circle cx="20" cy="20" r="13" fill="none" stroke="#3987e5" strokeWidth="6" strokeDasharray="18 100" strokeDashoffset="-34" transform="rotate(-90 20 20)" />
            </svg>
          </span>
          <span className="style-name">{t(`styles.${s.id}.name`)}</span>
          <span className="style-desc">{t(`styles.${s.id}.desc`)}</span>
        </button>
      ))}
    </div>
  );
}

export function LanguageSelect() {
  const { settings, saveSettings } = useStore();
  const t = useT();
  if (!settings) return null;
  return (
    <Select
      className="lang-select"
      value={settings.language}
      onChange={(v) => saveSettings({ language: v })}
      ariaLabel={t("settings.language")}
      options={[
        { value: "auto", label: t("settings.languageAuto"), lead: <Icon name="settings" size={14} /> },
        ...LANGUAGES.map((l) => ({ value: l.code, label: l.name, hint: l.name !== l.english ? l.english : undefined })),
      ]}
    />
  );
}

export function Settings() {
  const { settings, saveSettings, status, toast, bump, setExtWizard, setTour, setView } = useStore();
  const t = useT();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [forgetRange, setForgetRange] = useState<"hour" | "today" | "week" | "all">("hour");
  const [pickDays, setPickDays] = useState<number[] | null>(null);

  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => setAutostart(null));
  }, []);

  if (!settings || !status) return <div className="loading" />;
  const b = status.backend;

  const forget = async () => {
    const now = Date.now();
    const [ts] = dayBounds(new Date());
    const range: Record<typeof forgetRange, [number, number]> = {
      hour: [now - 3_600_000, now + 60_000],
      today: [ts, now + 60_000],
      week: [addDays(new Date(), -7).getTime(), now + 60_000],
      all: [0, now + 60_000],
    };
    const [s, e] = range[forgetRange];
    const label = t(`settings.forgetWhat.${forgetRange}`);
    if (!(await ask(t("settings.forgetConfirm", { what: label }), { title: t("settings.forget"), kind: "warning" }))) return;
    const n = await api.forget(s, e);
    bump();
    toast(t("settings.forgotten", { count: n, what: label }));
  };

  const forgetPicked = async () => {
    if (!pickDays?.length) return;
    const sorted = [...pickDays].sort((a, b) => a - b);
    const what = sorted.length === 1 ? fmtShortDate(new Date(sorted[0])) : t("settings.nDays", { count: sorted.length });
    if (!(await ask(t("settings.forgetConfirm", { what }), { title: t("settings.forgetDays"), kind: "warning" }))) return;
    const n = await api.forgetDays(sorted.map((d) => dayBounds(new Date(d))));
    bump();
    setPickDays(null);
    toast(t("settings.forgotten", { count: n, what }));
  };

  const resetAll = async () => {
    if (!(await ask(t("settings.resetConfirm"), { title: t("settings.reset"), kind: "warning" }))) return;
    if (!(await ask(t("settings.resetConfirm2"), { title: t("settings.reset"), kind: "warning" }))) return;
    await api.resetAll();

    location.reload();
  };

  return (
    <div className="settings">
      <section className="card">
        <header className="card-head">
          <h2>{t("settings.appearance")}</h2>
          <span className="dim">{t("settings.appearanceHint")}</span>
        </header>
        <Row title={t("settings.language")} desc={t("settings.languageHint")}>
          <LanguageSelect />
        </Row>
        <div className="set-row column">
          <div className="set-text">
            <div className="set-title">{t("settings.style")}</div>
            <div className="set-desc">{t("settings.styleHint")}</div>
          </div>
          <StylePicker value={settings.style} onChange={(v) => saveSettings({ style: v })} />
        </div>
        <Row title={t("settings.theme")}>
          <Segmented
            size="sm"
            value={settings.theme}
            onChange={(v) => saveSettings({ theme: v })}
            options={[
              { value: "system", label: t("settings.themeSystem") },
              { value: "dark", label: t("settings.themeDark") },
              { value: "light", label: t("settings.themeLight") },
            ]}
          />
        </Row>
        <Row title={t("settings.weekStart")}>
          <Segmented
            size="sm"
            value={settings.weekStartsMonday ? "mon" : "sun"}
            onChange={(v) => saveSettings({ weekStartsMonday: v === "mon" })}
            options={[
              { value: "mon", label: t("settings.monday") },
              { value: "sun", label: t("settings.sunday") },
            ]}
          />
        </Row>
        <Row title={t("settings.corners")} desc={t("settings.cornersHint")}>
          <Segmented
            size="sm"
            value={settings.corners}
            onChange={(v) => saveSettings({ corners: v })}
            options={(["sharp", "soft", "rounded", "round"] as const).map((v) => ({
              value: v,
              label: (
                <span className="corner-opt">
                  <i data-c={v} /> {t(`settings.cornersOpt.${v}`)}
                </span>
              ),
            }))}
          />
        </Row>
        <Row title={t("settings.size")} desc={t("settings.sizeHint")}>
          <Segmented
            size="sm"
            value={String(settings.uiScale)}
            onChange={(v) => saveSettings({ uiScale: Number(v) })}
            options={["90", "100", "110", "125"].map((v) => ({ value: v, label: `${v}%` }))}
          />
        </Row>
        <Row title={t("settings.font")}>
          <Segmented
            size="sm"
            value={settings.font}
            onChange={(v) => saveSettings({ font: v })}
            options={(["grotesk", "system", "mono"] as const).map((v) => ({ value: v, label: t(`settings.fontOpt.${v}`) }))}
          />
        </Row>
        <Row title={t("settings.motion")} desc={t("settings.motionHint")}>
          <Toggle label={t("settings.motion")} on={settings.reduceMotion} onChange={(v) => saveSettings({ reduceMotion: v })} />
        </Row>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>{t("settings.tracking")}</h2>
        </header>
        <Row
          title={t("settings.session")}
          desc={
            <>
              {b.label}. {b.ok ? t("settings.sessionOk") : b.note}
              {b.ok && b.note ? <> {b.note}</> : null}
            </>
          }
        >
          <span className={`status-pill ${b.ok ? "ok" : "bad"}`}>
            <Icon name={b.ok ? "check" : "alert"} size={13} /> {t(b.ok ? "settings.working" : "settings.needsAttention")}
          </span>
          {b.fix === "gnome-extension" && (
            <button
              className="btn sm primary"
              onClick={async () => {
                try {
                  toast(await api.installGnomeExtension());
                } catch (e) {
                  toast(String(e));
                }
              }}
            >
              {t("settings.installGnome")}
            </button>
          )}
        </Row>
        <Row title={t("settings.idle")} desc={t("settings.idleHint")}>
          <div className="range-wrap">
            <input type="range" min={60} max={900} step={30} value={settings.idleThresholdS} onChange={(e) => saveSettings({ idleThresholdS: Number(e.target.value) })} aria-label={t("settings.idle")} />
            <span className="mono">{t("settings.minutes", { n: Math.round((settings.idleThresholdS / 60) * 10) / 10 })}</span>
          </div>
        </Row>
        <Row title={t("settings.media")} desc={t("settings.mediaHint")}>
          <div className="stack-col">
            <ChipList items={settings.mediaApps} onRemove={(s) => saveSettings({ mediaApps: settings.mediaApps.filter((x) => x !== s) })} />
            <AddChip placeholder={t("settings.appOrDomain")} onAdd={(s) => saveSettings({ mediaApps: [...new Set([...settings.mediaApps, s])] })} />
          </div>
        </Row>
        <Row title={t("settings.backgroundAudio")} desc={t("settings.backgroundAudioHint")}>
          <Toggle label={t("settings.backgroundAudio")} on={settings.trackBackgroundAudio} onChange={(v) => saveSettings({ trackBackgroundAudio: v })} />
        </Row>
        <Row title={t("settings.calls")} desc={t("settings.callsHint")}>
          <Toggle label={t("settings.calls")} on={settings.trackCalls} onChange={(v) => saveSettings({ trackCalls: v })} />
        </Row>
        <Row title={t("settings.trackSelf")} desc={t("settings.trackSelfHint")}>
          <Toggle label={t("settings.trackSelf")} on={settings.trackSelf} onChange={(v) => saveSettings({ trackSelf: v })} />
        </Row>
        <Row title={t("settings.focusLength")} desc={t("settings.focusLengthHint")}>
          <Segmented
            size="sm"
            value={String(settings.focusMinutes)}
            onChange={(v) => saveSettings({ focusMinutes: Number(v) })}
            options={["25", "45", "50", "60", "90"].map((m) => ({ value: m, label: `${m}m` }))}
          />
        </Row>
        <Row title={t("settings.autostart")} desc={t("settings.autostartHint")}>
          {autostart === null ? (
            <span className="dim small">{t("settings.unavailable")}</span>
          ) : (
            <Toggle
              label={t("settings.autostart")}
              on={autostart}
              onChange={async (v) => {
                try {
                  await (v ? enable() : disable());
                  setAutostart(await isEnabled());
                } catch (e) {
                  toast(String(e));
                }
              }}
            />
          )}
        </Row>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>{t("settings.privacy")}</h2>
          <span className="dim">{t("settings.privacyHint")}</span>
        </header>
        <Row title={t("settings.titles")} desc={t("settings.titlesHint")}>
          <Toggle label={t("settings.titles")} on={settings.recordTitles} onChange={(v) => saveSettings({ recordTitles: v })} />
        </Row>
        <Row title={t("settings.titleExclusions")} desc={t("settings.titleExclusionsHint")}>
          <div className="stack-col">
            <ChipList items={settings.titleExclusions} onRemove={(s) => saveSettings({ titleExclusions: settings.titleExclusions.filter((x) => x !== s) })} />
            <AddChip placeholder={t("settings.appKey")} onAdd={(s) => saveSettings({ titleExclusions: [...new Set([...settings.titleExclusions, s])] })} />
          </div>
        </Row>
        <Row title={t("settings.ignored")} desc={t("settings.ignoredHint")}>
          <div className="stack-col">
            <ChipList items={settings.ignoredApps} onRemove={(s) => saveSettings({ ignoredApps: settings.ignoredApps.filter((x) => x !== s) })} />
            <AddChip placeholder={t("settings.appKey")} onAdd={(s) => saveSettings({ ignoredApps: [...new Set([...settings.ignoredApps, s])] })} />
          </div>
        </Row>
        <Row title={t("settings.forget")} desc={t("settings.forgetHint")}>
          <Segmented
            size="sm"
            value={forgetRange}
            onChange={setForgetRange}
            options={[
              { value: "hour", label: t("settings.forgetRange.hour") },
              { value: "today", label: t("settings.forgetRange.today") },
              { value: "week", label: t("settings.forgetRange.week") },
              { value: "all", label: t("settings.forgetRange.all") },
            ]}
          />
          <button className="btn sm danger" onClick={forget}>
            <Icon name="trash" size={14} /> {t("rules.delete")}
          </button>
        </Row>
        <Row title={t("settings.forgetDays")} desc={t("settings.forgetDaysHint")}>
          <button className="btn sm" onClick={() => setPickDays(pickDays ? null : [])}>
            <Icon name="calendar" size={14} /> {t(pickDays ? "settings.cancel" : "settings.chooseDays")}
          </button>
        </Row>
        {pickDays && (
          <div className="forget-days">
            <DayPicker picked={pickDays} onChange={setPickDays} />
            <button className="btn sm danger" disabled={pickDays.length === 0} onClick={forgetPicked}>
              <Icon name="trash" size={14} /> {t("settings.deleteDays", { count: pickDays.length })}
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <header className="card-head">
          <h2>{t("settings.browser")}</h2>
        </header>
        <Row title={t("settings.extension")} desc={t("settings.extensionHint", { port: settings.bridgePort })}>
          <span className={`status-pill ${status.extensionConnected ? "ok" : ""}`}>
            <Icon name={status.extensionConnected ? "check" : "puzzle"} size={13} /> {t(status.extensionConnected ? "settings.connected" : "settings.notConnected")}
          </span>
          <button className={`btn sm ${status.extensionConnected ? "" : "primary"}`} onClick={() => setExtWizard(true)}>
            <Icon name="puzzle" size={14} /> {t(status.extensionConnected ? "settings.extensionReinstall" : "settings.setUpExtension")}
          </button>
        </Row>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>{t("settings.notifications")}</h2>
        </header>
        <Row title={t("settings.goalNudges")} desc={t("settings.goalNudgesHint")}>
          <Toggle label={t("settings.goalNudges")} on={settings.notifications} onChange={(v) => saveSettings({ notifications: v })} />
        </Row>
        <Row title={t("settings.weekly")} desc={t("settings.weeklyHint")}>
          <Toggle label={t("settings.weekly")} on={settings.weeklyReportNotice} onChange={(v) => saveSettings({ weeklyReportNotice: v })} />
        </Row>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>{t("settings.data")}</h2>
        </header>
        <Row title={t("settings.database")} desc={<code className="path">{status.dbPath}</code>}>
          <button className="btn sm" onClick={() => api.openDataFolder()}>
            <Icon name="folder" size={14} /> {t("settings.openFolder")}
          </button>
        </Row>
        <Row title={t("settings.about")} desc={t("settings.aboutText", { version: status.version, platform: status.platform })}>
          <button className="btn sm" onClick={() => api.openWebsite()}>
            <Icon name="external" size={14} /> zsync.eu/ztally
          </button>
          <button className="btn sm" onClick={() => (setView("today"), setTour(true))}>
            <Icon name="compass" size={14} /> {t("settings.takeTour")}
          </button>
          <button className="btn sm ghost" onClick={() => saveSettings({ onboarded: false })}>
            {t("settings.replayIntro")}
          </button>
        </Row>
      </section>
      <section className="card danger-zone">
        <header className="card-head">
          <h2>{t("settings.reset")}</h2>
        </header>
        <Row title={t("settings.resetTitle")} desc={t("settings.resetHint")}>
          <button className="btn sm danger" onClick={resetAll}>
            <Icon name="trash" size={14} /> {t("settings.resetButton")}
          </button>
        </Row>
      </section>
    </div>
  );
}
