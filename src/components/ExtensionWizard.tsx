

import { useEffect, useState, type ReactNode } from "react";
import { rich, useT } from "../lib/i18n";
import { api, type BrowserInfo } from "../lib/ipc";
import { useStore } from "../lib/store";
import { copyText } from "../lib/tour";
import { Glyph } from "./bits";
import { Icon } from "./Icon";

type Choice = BrowserInfo | { id: "other-chromium" | "other-firefox"; name: string; family: "chromium" | "firefox"; extPage: string };

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="xw-step">
      <span className="xw-n">{n}</span>
      <div className="xw-body">
        <b>{title}</b>
        {children}
      </div>
    </li>
  );
}


function Mock({ family, part, address }: { family: "chromium" | "firefox"; part: "toggle" | "load"; address: string }) {
  const t = useT();
  if (family === "firefox") {
    return (
      <div className="xw-mock ff" aria-hidden="true">
        <div className="xw-mock-bar">{address.split("#")[0]}</div>
        <div className="xw-mock-row">
          <span className="xw-mock-title">{t("wizard.mock.temporary")}</span>
          <span className="xw-mock-btn hot">{t("wizard.mock.loadTemp")}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="xw-mock" aria-hidden="true">
      <div className="xw-mock-bar">{address}</div>
      <div className="xw-mock-row">
        <span className={`xw-mock-btn ${part === "load" ? "hot" : ""}`}>{t("wizard.mock.loadUnpacked")}</span>
        <span className="grow" />
        <span className={`xw-mock-toggle ${part === "toggle" ? "hot" : ""}`}>
          {t("wizard.mock.devMode")} <i />
        </span>
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn sm"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }
      }}
    >
      <Icon name={done ? "check" : "copy"} size={14} /> {done ? t("wizard.copied") : label}
    </button>
  );
}

export function ExtensionWizard({ compact }: { compact?: boolean }) {
  const t = useT();
  const { status, toast } = useStore();
  const [browsers, setBrowsers] = useState<BrowserInfo[] | null>(null);
  const [dir, setDir] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [landed, setLanded] = useState<boolean | null>(null);

  useEffect(() => {
    api.detectBrowsers().then(setBrowsers).catch(() => setBrowsers([]));
    api.prepareExtension().then(setDir).catch(() => {});
  }, []);

  const others: Choice[] = [
    { id: "other-chromium", name: t("wizard.otherChromium"), family: "chromium", extPage: "chrome://extensions" },
    { id: "other-firefox", name: t("wizard.otherFirefox"), family: "firefox", extPage: "about:debugging#/runtime/this-firefox" },
  ];
  const all: Choice[] = [...(browsers ?? []), ...others];
  const b = all.find((x) => x.id === pick) ?? all[0];
  const detected = !!browsers?.some((x) => x.id === b.id);
  const sep = status?.platform === "windows" ? "\\" : "/";
  const manifest = dir ? `${dir}${sep}manifest.json` : "";
  const connected = !!status?.extensionConnected;

  const open = async () => {
    try {
      setLanded(await api.openExtensionPage(b.id));
    } catch (e) {
      toast(String(e));
    }
  };

  return (
    <div className={`xw ${compact ? "compact" : ""}`}>
      <div className="xw-browsers" role="radiogroup" aria-label={t("wizard.whichBrowser")}>
        {all.map((x) => (
          <button key={x.id} role="radio" aria-checked={x.id === b.id} className={`xw-browser ${x.id === b.id ? "on" : ""}`} onClick={() => (setPick(x.id), setLanded(null))}>
            {x.id.startsWith("other") ? <Icon name="puzzle" size={16} /> : <Glyph label={x.name} size={20} />}
            {x.name}
          </button>
        ))}
      </div>

      <ol className="xw-steps">
        {b.family === "chromium" ? (
          <>
            <Step n={1} title={t("wizard.c1.title", { browser: b.name })}>
              <p>{rich(t("wizard.c1.body"), { address: <code>{b.extPage}</code> })}</p>
              <div className="xw-actions">
                <CopyButton text={b.extPage} label={t("wizard.copyAddress")} />
                {detected && (
                  <button className="btn sm primary" onClick={open}>
                    <Icon name="external" size={14} /> {t("wizard.openBrowser", { browser: b.name })}
                  </button>
                )}
              </div>
              {landed === false && <p className="xw-note">{t("wizard.pasteNote")}</p>}
            </Step>
            <Step n={2} title={t("wizard.c2.title")}>
              <p>{t("wizard.c2.body")}</p>
              <Mock family="chromium" part="toggle" address={b.extPage} />
            </Step>
            <Step n={3} title={t("wizard.c3.title")}>
              <p>{t("wizard.c3.body")}</p>
              <Mock family="chromium" part="load" address={b.extPage} />
              <code className="xw-path">{dir}</code>
              <div className="xw-actions">
                <CopyButton text={dir} label={t("wizard.copyPath")} />
                <button className="btn sm ghost" onClick={() => api.openBrowserExtension()}>
                  <Icon name="folder" size={14} /> {t("wizard.showFolder")}
                </button>
              </div>
              <p className="xw-note">{t(status?.platform === "windows" ? "wizard.dialogHintWin" : "wizard.dialogHint")}</p>
            </Step>
          </>
        ) : (
          <>
            <Step n={1} title={t("wizard.f1.title", { browser: b.name })}>
              <p>{rich(t("wizard.f1.body"), { address: <code>{b.extPage}</code> })}</p>
              <div className="xw-actions">
                {detected && (
                  <button className="btn sm primary" onClick={open}>
                    <Icon name="external" size={14} /> {t("wizard.openBrowser", { browser: b.name })}
                  </button>
                )}
                <CopyButton text={b.extPage} label={t("wizard.copyAddress")} />
              </div>
            </Step>
            <Step n={2} title={t("wizard.f2.title")}>
              <p>{t("wizard.f2.body")}</p>
              <Mock family="firefox" part="load" address={b.extPage} />
              <code className="xw-path">{manifest}</code>
              <div className="xw-actions">
                <CopyButton text={manifest} label={t("wizard.copyPath")} />
                <button className="btn sm ghost" onClick={() => api.openBrowserExtension()}>
                  <Icon name="folder" size={14} /> {t("wizard.showFolder")}
                </button>
              </div>
              <p className="xw-note">{t(status?.platform === "windows" ? "wizard.dialogHintWin" : "wizard.dialogHint")}</p>
            </Step>
            <li className="xw-warn">
              <Icon name="alert" size={15} />
              <span>{t("wizard.ffTemporary")}</span>
            </li>
          </>
        )}
      </ol>

      <div className={`xw-status ${connected ? "ok" : ""}`} role="status" aria-live="polite">
        {connected ? (
          <>
            <Icon name="check" size={18} />
            <div>
              <b>{t("wizard.connected")}</b>
              <span>{t(status?.extensionBrowser === "firefox" ? "wizard.connectedFirefox" : "wizard.connectedChromium")}</span>
            </div>
          </>
        ) : (
          <>
            <span className="xw-spinner" />
            <div>
              <b>{t("wizard.waiting")}</b>
              <span>{t("wizard.waitingHint")}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ExtensionWizardModal() {
  const { extWizard, setExtWizard } = useStore();
  const t = useT();
  if (!extWizard) return null;
  return (
    <div className="modal-backdrop" onMouseDown={() => setExtWizard(false)}>
      <div className="modal xw-modal" role="dialog" aria-label={t("wizard.title")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="xw-head">
          <div>
            <div className="fr-kicker">
              <Icon name="puzzle" size={14} /> ZTally Bridge
            </div>
            <h2>{t("wizard.title")}</h2>
            <p className="dim small">{t("wizard.why")}</p>
          </div>
          <button className="icon-btn" onClick={() => setExtWizard(false)} aria-label={t("window.close")}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <ExtensionWizard />
      </div>
    </div>
  );
}
