

import { useMemo, useState } from "react";
import { CatDot, Glyph, Segmented } from "../components/bits";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { useActions } from "../lib/actions";
import { api, type Category, type Kind, type Rule } from "../lib/ipc";
import { useT } from "../lib/i18n";
import { catColor, useCatName, useLoader, useStore } from "../lib/store";
import { fmtDur } from "../lib/time";

const KINDS: Kind[] = ["productive", "neutral", "distracting"];

export function Rules() {
  const { categories, reloadCategories, bump, version, toast } = useStore();
  const t = useT();
  const catName = useCatName();
  const rules = useLoader(() => api.rules(), [version]);
  const apps = useLoader(() => api.apps(), [version]);
  const domains = useLoader(() => api.domains(), [version]);
  const [query, setQuery] = useState("");
  const [showBuiltin, setShowBuiltin] = useState(false);
  const { assign, openMenu, menuEl } = useActions();


  const inbox = useMemo(() => {
    if (!rules || !apps || !domains) return [];
    const appRules = new Set(rules.filter((r) => r.matchType === "app").map((r) => r.pattern));
    const domRules = rules.filter((r) => r.matchType === "domain").map((r) => r.pattern);
    const domMatch = (d: string) => domRules.some((p) => d === p || d.endsWith("." + p));
    const a = apps.filter((x) => !appRules.has(x.key) && x.totalMs > 60_000).map((x) => ({ kind: "app" as const, key: x.key, label: x.display, ms: x.totalMs }));
    const d = domains.filter(([k, ms]) => !domMatch(k) && ms > 60_000).map(([k, ms]) => ({ kind: "domain" as const, key: k, label: k, ms }));
    return [...a, ...d].sort((x, y) => y.ms - x.ms).slice(0, 30);
  }, [rules, apps, domains]);

  const saveCat = async (c: Category) => {
    try {
      await api.saveCategory(c);
      await reloadCategories();
      bump();
    } catch (e) {
      toast(String(e));
    }
  };

  const addCat = async () => {
    const used = new Set(categories.map((c) => c.slot));
    const slot = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !used.has(s)) ?? 7;
    await saveCat({ id: 0, name: t("rules.newCategory"), slot, kind: "neutral" });
  };

  const delCat = async (c: Category) => {
    await api.deleteCategory(c.id);
    await reloadCategories();
    bump();
    toast(t("rules.deleted", { name: catName(c) }));
  };

  const userRules = (rules ?? []).filter((r) => r.priority > 0);
  const builtin = (rules ?? []).filter((r) => r.priority === 0 && (!query || r.pattern.includes(query.toLowerCase())));

  return (
    <div className="rules">
      <section className="card">
        <header className="card-head">
          <h2>{t("week.categories")}</h2>
          <span className="dim">{t("rules.categoriesHint")}</span>
          <button className="btn sm" onClick={addCat} disabled={categories.length >= 12}>
            <Icon name="plus" size={14} /> {t("rules.add")}
          </button>
        </header>
        <div className="cat-grid">
          {categories.map((c) => (
            <CategoryCard key={c.id} c={c} onSave={saveCat} onDelete={() => delCat(c)} />
          ))}
        </div>
      </section>

      <div className="rules-grid">
        <section className="card">
          <header className="card-head">
            <h2>{t("rules.inbox")}</h2>
            <span className="dim">{t("rules.inboxHint")}</span>
          </header>
          {inbox.length === 0 ? (
            <div className="inbox-zero">
              <Icon name="check" size={18} /> {t("rules.inboxZero")}
            </div>
          ) : (
            <ul className="inbox">
              {inbox.map((it) => (
                <li key={it.kind + it.key}>
                  <Glyph label={it.label} size={26} site={it.kind === "domain"} />
                  <div className="grow">
                    <div className="ellipsis">{it.label}</div>
                    <div className="dim small">
                      {t(it.kind === "app" ? "rules.kindApp" : "rules.kindSite")} · {t("rules.total", { time: fmtDur(it.ms) })}
                    </div>
                  </div>
                  <div className="quick-cats">
                    {categories.slice(0, 8).map((c) => (
                      <button key={c.id} className="qc" style={{ background: catColor(c) }} title={catName(c)} aria-label={t("rules.fileUnder", { name: catName(c) })} onClick={() => assign({ ...it, cat: null }, c.id)} />
                    ))}
                    <button
                      className="icon-btn"
                      aria-label={t("rules.more")}
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        openMenu({ ...it, cat: null }, r.left - 160, r.bottom + 4);
                      }}
                    >
                      <Icon name="drag" size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <header className="card-head">
            <h2>{t("rules.yours")}</h2>
            <span className="dim">{t("rules.yoursHint")}</span>
          </header>
          <RuleComposer categories={categories} onAdd={async (t, p, c) => { await api.addRule(t, p, c); bump(); }} />
          <RuleList rules={userRules} categories={categories} onDelete={async (r) => { await api.deleteRule(r.id); bump(); }} empty={t("rules.yoursEmpty")} />

          <button className="disclosure" onClick={() => setShowBuiltin(!showBuiltin)} aria-expanded={showBuiltin}>
            <Icon name={showBuiltin ? "x" : "plus"} size={12} /> {t("rules.builtin", { n: (rules ?? []).filter((r) => r.priority === 0).length })}
          </button>
          {showBuiltin && (
            <>
              <div className="row gap">
                <input className="input grow" placeholder={t("rules.filter")} value={query} onChange={(e) => setQuery(e.target.value)} />
                <button
                  className="btn sm ghost"
                  onClick={async () => {
                    await api.resetRules();
                    bump();
                    toast(t("rules.restored"));
                  }}
                >
                  {t("rules.restore")}
                </button>
              </div>
              <RuleList rules={builtin.slice(0, 200)} categories={categories} onDelete={async (r) => { await api.deleteRule(r.id); bump(); }} empty={t("palette.noMatches")} />
            </>
          )}
        </section>
      </div>
      {menuEl}
    </div>
  );
}

function CategoryCard({ c, onSave, onDelete }: { c: Category; onSave: (c: Category) => void; onDelete: () => void }) {
  const t = useT();
  const catName = useCatName();
  const [name, setName] = useState(catName(c));
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="cat-card" style={{ ["--g" as string]: catColor(c) }}>
      <div className="cat-card-top">
        <span className="cat-swatch" />
        <input
          className="cat-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== catName(c) && onSave({ ...c, name: name.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={t("rules.nameAria")}
        />
        <button className={`icon-btn ${confirm ? "danger" : ""}`} onClick={() => (confirm ? onDelete() : setConfirm(true))} onBlur={() => setConfirm(false)} aria-label={t(confirm ? "rules.confirmDelete" : "rules.deleteCategory")} title={t(confirm ? "rules.confirmDelete" : "rules.delete")}>
          <Icon name={confirm ? "check" : "trash"} size={14} />
        </button>
      </div>
      <div className="swatches" role="radiogroup" aria-label={t("rules.colour")}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
          <button key={s} role="radio" aria-checked={s === c.slot} aria-label={t("rules.colourN", { n: s })} className={s === c.slot ? "sw on" : "sw"} style={{ background: `var(--c${s})` }} onClick={() => onSave({ ...c, slot: s })} />
        ))}
      </div>
      <Segmented size="sm" value={c.kind} options={KINDS.map((k) => ({ value: k, label: t(`rules.kind.${k}`) }))} onChange={(k) => onSave({ ...c, kind: k })} />
    </div>
  );
}

function RuleComposer({ categories, onAdd }: { categories: Category[]; onAdd: (t: Rule["matchType"], p: string, c: number) => void }) {
  const t = useT();
  const catName = useCatName();
  const [type, setType] = useState<Rule["matchType"]>("title");
  const [pattern, setPattern] = useState("");
  const [cat, setCat] = useState<number>(0);
  const catId = cat || categories[0]?.id || 0;
  const placeholder = t(`rules.placeholder.${type}`);
  return (
    <form
      className="rule-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pattern.trim() || !catId) return;
        onAdd(type, pattern.trim(), catId);
        setPattern("");
      }}
    >
      <Select
        size="sm"
        value={type}
        onChange={setType}
        ariaLabel={t("rules.matchAria")}
        options={(["title", "domain", "app"] as const).map((v) => ({ value: v, label: t(`rules.match.${v}`) }))}
      />
      <input className="input grow" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder={placeholder} aria-label={t("rules.patternAria")} />
      <Select
        size="sm"
        value={catId}
        onChange={setCat}
        ariaLabel={t("rules.categoryAria")}
        options={categories.map((c) => ({ value: c.id, label: catName(c), lead: <CatDot cat={c} /> }))}
      />
      <button className="btn sm primary" type="submit">
        {t("rules.add")}
      </button>
    </form>
  );
}

function RuleList({ rules, categories, onDelete, empty }: { rules: Rule[]; categories: Category[]; onDelete: (r: Rule) => void; empty: string }) {
  const t = useT();
  const catName = useCatName();
  if (rules.length === 0) return <p className="dim small pad-y">{empty}</p>;
  return (
    <ul className="rule-list">
      {rules.map((r) => {
        const c = categories.find((x) => x.id === r.categoryId);
        return (
          <li key={r.id}>
            <span className={`rule-type t-${r.matchType}`}>{t(`rules.type.${r.matchType}`)}</span>
            <code className="grow ellipsis">{r.pattern}</code>
            <span className="rule-cat">
              <CatDot cat={c} /> {catName(c)}
            </span>
            <button className="icon-btn" onClick={() => onDelete(r)} aria-label={t("rules.deleteRule")}>
              <Icon name="x" size={13} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
