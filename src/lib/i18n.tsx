

import { createContext, Fragment, useContext, useMemo, type ReactNode } from "react";

type Dict = { [k: string]: string | Dict };

const files = import.meta.glob<Dict>("../locales/*.json", { eager: true, import: "default" });

export const LOCALES: Record<string, Dict> = Object.fromEntries(
  Object.entries(files).map(([path, dict]) => [path.split("/").pop()!.replace(/\.json$/, ""), dict]),
);

export interface LanguageInfo {
  code: string;
  name: string;
  english: string;
}

export const LANGUAGES: LanguageInfo[] = Object.entries(LOCALES)
  .map(([code, d]) => {
    const meta = (d._meta ?? {}) as Dict;
    return { code, name: String(meta.name ?? code), english: String(meta.english ?? code) };
  })
  .sort((a, b) => (a.code === "en" ? -1 : b.code === "en" ? 1 : a.name.localeCompare(b.name)));


export function resolveLanguage(setting: string | undefined): string {
  if (setting && setting !== "auto" && LOCALES[setting]) return setting;
  for (const pref of navigator.languages ?? [navigator.language]) {
    const p = pref.toLowerCase();
    const exact = Object.keys(LOCALES).find((c) => c.toLowerCase() === p);
    if (exact) return exact;

    const lang = p.split("-")[0];
    const base = Object.keys(LOCALES).find((c) => c.toLowerCase() === lang) ?? Object.keys(LOCALES).find((c) => c.toLowerCase().split("-")[0] === lang);
    if (base) return base;
  }
  return "en";
}

function lookup(dict: Dict | undefined, key: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split(".")) {
    if (cur === undefined || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export type Vars = Record<string, string | number>;
export type TFn = (key: string, vars?: Vars) => string;

export function makeT(lang: string): TFn {
  const primary = LOCALES[lang];
  const fallback = LOCALES.en;
  const plural = new Intl.PluralRules(lang);
  return (key, vars) => {
    let s: string | undefined;
    if (vars && typeof vars.count === "number") {
      const form = plural.select(vars.count);
      s = lookup(primary, `${key}_${form}`) ?? lookup(primary, `${key}_other`) ?? lookup(fallback, `${key}_${new Intl.PluralRules("en").select(vars.count)}`) ?? lookup(fallback, `${key}_other`);
    }
    s ??= lookup(primary, key) ?? lookup(fallback, key);
    if (s === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };
}


let activeLocale = "en";
export const currentLocale = () => activeLocale;

interface I18n {
  lang: string;
  t: TFn;
}

const Ctx = createContext<I18n>({ lang: "en", t: makeT("en") });

export function I18nProvider({ setting, children }: { setting: string | undefined; children: ReactNode }) {
  const value = useMemo(() => {
    const lang = resolveLanguage(setting);


    const base = lang.split("-")[0].toLowerCase();
    activeLocale = (navigator.languages ?? [navigator.language]).find((l) => l.toLowerCase().split("-")[0] === base) ?? lang;
    document.documentElement.lang = lang;
    return { lang, t: makeT(lang) };
  }, [setting]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): TFn {
  return useContext(Ctx).t;
}

export function useLang(): string {
  return useContext(Ctx).lang;
}


export function rich(template: string, parts: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  template.replace(/\{(\w+)\}/g, (m, k: string, i: number) => {
    out.push(template.slice(last, i));
    out.push(k in parts ? <Fragment key={i}>{parts[k]}</Fragment> : m);
    last = i + m.length;
    return m;
  });
  out.push(template.slice(last));
  return <>{out}</>;
}
