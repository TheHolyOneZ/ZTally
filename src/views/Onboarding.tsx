import { enable } from "@tauri-apps/plugin-autostart";
import { useState } from "react";
import { Segmented, Toggle } from "../components/bits";
import { ExtensionWizard } from "../components/ExtensionWizard";
import { Icon, Logo } from "../components/Icon";
import { rich, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../lib/store";
import { LanguageSelect, StylePicker } from "./Settings";

const STEPS = 5;

export function Onboarding() {
  const { settings, saveSettings, status, toast, setTour, setView } = useStore();
  const t = useT();
  const [step, setStep] = useState(0);
  const [autostart, setAutostart] = useState(true);
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  if (!settings || !status) return null;
  const b = status.backend;

  const finish = async (tour: boolean) => {
    if (autostart) await enable().catch(() => {});
    await saveSettings({ onboarded: true });
    if (tour) {
      setView("today");
      setTour(true);
    }
  };

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label={t("onboarding.aria")}>
      <div className="onboard-card">
        <div className="onboard-top">
          <div className="onboard-steps" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={i <= step ? "on" : ""} />
            ))}
          </div>
          {step === 0 && <LanguageSelect />}
        </div>

        {step === 0 && (
          <div className="ob-body">
            <Logo size={64} />
            <h1>{t("onboarding.welcome.title")}</h1>
            <p className="lead">
              {t("onboarding.welcome.lead")} <b>{t("onboarding.welcome.local")}</b>
            </p>
            <div className={`ob-session ${b.ok ? "ok" : "bad"}`}>
              <Icon name={b.ok ? "check" : "alert"} size={18} />
              <div className="grow">
                <b>{b.label}</b>
                <div className="small">{b.ok ? t("onboarding.welcome.detected") : b.note}</div>
                {installMsg && <div className="small strong">{installMsg}</div>}
              </div>
              {b.fix === "gnome-extension" && (
                <button
                  className="btn sm primary"
                  onClick={async () => {
                    try {
                      setInstallMsg(await api.installGnomeExtension());
                    } catch (e) {
                      toast(String(e));
                    }
                  }}
                >
                  {t("onboarding.welcome.installHelper")}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="ob-body">
            <h1>{t("onboarding.privacy.title")}</h1>
            <p className="lead">{t("onboarding.privacy.lead")}</p>
            <div className="choice-grid">
              <button className={`choice ${settings.recordTitles ? "on" : ""}`} onClick={() => saveSettings({ recordTitles: true })}>
                <Icon name="eye" size={20} />
                <b>{t("onboarding.privacy.full")}</b>
                <span>{t("onboarding.privacy.fullHint")}</span>
              </button>
              <button className={`choice ${!settings.recordTitles ? "on" : ""}`} onClick={() => saveSettings({ recordTitles: false })}>
                <Icon name="eyeOff" size={20} />
                <b>{t("onboarding.privacy.minimal")}</b>
                <span>{t("onboarding.privacy.minimalHint")}</span>
              </button>
            </div>
            <label className="ob-toggle">
              <Toggle label={t("settings.autostart")} on={autostart} onChange={setAutostart} />
              <span>
                <b>{t("settings.autostart")}</b>
                <span className="dim small">{t("onboarding.privacy.autostartHint")}</span>
              </span>
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="ob-body">
            <h1>{t("onboarding.look.title")}</h1>
            <p className="lead">{t("onboarding.look.lead")}</p>
            <StylePicker value={settings.style} onChange={(v) => saveSettings({ style: v })} />
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
          </div>
        )}

        {step === 3 && (
          <div className="ob-body ob-wide">
            <h1>{t("onboarding.browser.title")}</h1>
            <p className="lead">{rich(t("onboarding.browser.lead"), { name: <b>ZTally Bridge</b> })}</p>
            <ExtensionWizard compact />
          </div>
        )}

        {step === 4 && (
          <div className="ob-body">
            <Logo size={56} />
            <h1>{t("onboarding.ready.title")}</h1>
            <p className="lead">{t("onboarding.ready.lead")}</p>
            <div className="ob-tips">
              <div>{rich(t("onboarding.tips.recategorise"), { key: <kbd>{t("onboarding.tips.rightClick")}</kbd> })}</div>
              <div>{rich(t("onboarding.tips.palette"), { key: <><kbd>Ctrl</kbd> <kbd>K</kbd></> })}</div>
              <div>{rich(t("onboarding.tips.days"), { key: <><kbd>←</kbd> <kbd>→</kbd></> })}</div>
            </div>
          </div>
        )}

        <div className="onboard-nav">
          {step > 0 ? (
            <button className="btn ghost" onClick={() => setStep(step - 1)}>
              {t("onboarding.back")}
            </button>
          ) : (
            <span />
          )}
          {step < STEPS - 1 ? (
            <div className="row gap">
              {step === 3 && !status.extensionConnected && (
                <button className="btn ghost" onClick={() => setStep(step + 1)}>
                  {t("onboarding.later")}
                </button>
              )}
              <button className="btn primary" onClick={() => setStep(step + 1)}>
                {t("onboarding.continue")} <Icon name="right" size={16} />
              </button>
            </div>
          ) : (
            <div className="row gap">
              <button className="btn ghost" onClick={() => finish(false)}>
                {t("onboarding.skipTour")}
              </button>
              <button className="btn primary" onClick={() => finish(true)}>
                <Icon name="compass" size={16} /> {t("onboarding.startTour")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
