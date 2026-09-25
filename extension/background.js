

const api = globalThis.browser ?? globalThis.chrome;
const ENDPOINT = "http://127.0.0.1:47631/v1/tab";
let last = "";

async function focusedWindow() {
  const win = await api.windows.getLastFocused({ populate: false }).catch(() => null);
  return win && win.focused ? win : null;
}

async function activeTab(win) {
  if (!win) return null;
  const [tab] = await api.tabs.query({ active: true, windowId: win.id });
  return tab ?? null;
}


async function audibleTabs(win) {
  const tabs = await api.tabs.query({ audible: true }).catch(() => []);
  return tabs
    .filter((t) => !(t.mutedInfo && t.mutedInfo.muted))
    .map((t) => ({
      url: t.incognito ? "" : t.url ?? "",
      title: t.incognito ? "" : t.title ?? "",
      incognito: !!t.incognito,
      active: !!win && t.active && t.windowId === win.id,
    }));
}

async function report(force = false) {
  const win = await focusedWindow();
  const tab = await activeTab(win);
  const payload = {
    url: tab?.url ?? "",
    title: tab?.title ?? "",
    browser: navigator.userAgent.includes("Firefox") ? "firefox" : "chromium",
    audible: !!tab?.audible && !(tab?.mutedInfo && tab.mutedInfo.muted),
    incognito: !!tab?.incognito,
    audibleTabs: await audibleTabs(win),
  };
  const key = JSON.stringify(payload);
  if (!force && key === last) return;
  last = key;
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ZTally": "1" },
      body: key,
    });
  } catch {

    last = "";
  }
}

api.tabs.onActivated.addListener(() => report());
api.tabs.onUpdated.addListener((_id, change, tab) => {

  if ("audible" in change || "mutedInfo" in change) report();
  else if (tab.active && (change.url || change.title)) report();
});
api.tabs.onRemoved.addListener(() => report());
api.windows.onFocusChanged.addListener(() => report());
api.alarms.create("ztally-heartbeat", { periodInMinutes: 0.5 });
api.alarms.onAlarm.addListener((a) => {
  if (a.name === "ztally-heartbeat") report(true);
});
api.runtime.onStartup?.addListener(() => report(true));
api.runtime.onInstalled?.addListener(() => report(true));
report(true);
