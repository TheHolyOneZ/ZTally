import { useState } from "react";
import { CatDot, Glyph } from "../components/bits";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { api, type Category, type Goal, type GoalProgress } from "../lib/ipc";
import { rich, useT, type TFn } from "../lib/i18n";
import { useCatName, useLoader, useStore } from "../lib/store";
import { dayBounds, fmtDur, startOfWeek, weekDays } from "../lib/time";

const PRESETS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 900, 1200, 1800, 2400];

function targetLabel(g: Goal, cats: Category[], apps: Map<string, string>, t: TFn, catName: (c: Category) => string): string {
  switch (g.targetKind) {
    case "total":
      return t("goals.screenTime");
    case "category": {
      const c = cats.find((c) => String(c.id) === g.target);
      return c ? catName(c) : t("goals.deletedCategory");
    }
    case "app":
      return apps.get(g.target) ?? g.target;
    case "domain":
      return g.target;
  }
}

export function Goals() {
  const { categories, settings, version, bump, toast } = useStore();
  const now = new Date();
  const day = dayBounds(now);
  const wd = weekDays(startOfWeek(now, settings?.weekStartsMonday ?? true));
  const week: [number, number] = [wd[0][0], wd[6][1]];
  const progress = useLoader(() => api.goalProgress(day, week), [version, day[0]], 30_000);
  const apps = useLoader(() => api.apps(), [version]);
  const domains = useLoader(() => api.domains(), [version]);
  const appNames = new Map((apps ?? []).map((a) => [a.key, a.display]));
  const t = useT();
  const catName = useCatName();
  const label = (g: Omit<Goal, "id">) => targetLabel({ ...g, id: 0 }, categories, appNames, t, catName);

  const add = async (g: Omit<Goal, "id">) => {
    await api.saveGoal({ ...g, id: 0 });
    bump();
    toast(t("goals.added"));
  };
  const remove = async (g: Goal) => {
    await api.deleteGoal(g.id);
    bump();
    toast(t("goals.removed"), { label: t("actions.undo"), run: async () => (await api.saveGoal({ ...g, id: 0 }), bump()) });
  };

  const cat = (name: string) => categories.find((c) => c.name === name);
  const suggestions: Omit<Goal, "id">[] = [
    cat("Social") && { targetKind: "category", target: String(cat("Social")!.id), period: "day", op: "max", minutes: 45 },
    cat("Deep Work") && { targetKind: "category", target: String(cat("Deep Work")!.id), period: "day", op: "min", minutes: 240 },
    { targetKind: "total", target: "", period: "day", op: "max", minutes: 600 },
    cat("Entertainment") && { targetKind: "category", target: String(cat("Entertainment")!.id), period: "week", op: "max", minutes: 600 },
  ].filter(Boolean) as Omit<Goal, "id">[];

  return (
    <div className="goals">
      <Composer categories={categories} apps={(apps ?? []).slice(0, 40)} domains={(domains ?? []).slice(0, 40).map((d) => d[0])} onAdd={add} />

      {progress && progress.length === 0 && (
        <section className="card pad">
          <h2 className="side-title">{t("goals.startWith")}</h2>
          <div className="suggestions">
            {suggestions.map((s, i) => (
              <button key={i} className="suggestion" onClick={() => add(s)}>
                <Icon name="plus" size={14} />
                {rich(t(s.period === "day" ? "goals.perDay" : "goals.perWeek"), { goal: <GoalSentence g={{ ...s, id: 0 }} label={label(s)} /> })}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="goal-grid">
        {(progress ?? []).map((p) => (
          <GoalCard key={p.goal.id} p={p} label={label(p.goal)} cat={p.goal.targetKind === "category" ? categories.find((c) => String(c.id) === p.goal.target) : undefined} onDelete={() => remove(p.goal)} />
        ))}
      </div>
    </div>
  );
}

function GoalCard({ p, label, cat, onDelete }: { p: GoalProgress; label: string; cat?: Category; onDelete: () => void }) {
  const g = p.goal;
  const limit = g.minutes * 60_000;
  const r = 52;
  const circ = 2 * Math.PI * r;
  const lap1 = Math.min(1, p.ratio);
  const lap2 = Math.max(0, Math.min(1, p.ratio - 1));
  const t = useT();
  let tone: "good" | "warning" | "critical" | "brand";
  let status: string;
  let icon: string;
  if (g.op === "max") {
    if (p.ratio >= 1) [tone, status, icon] = ["critical", t("goals.over", { time: fmtDur(p.usedMs - limit) }), "alert"];
    else if (p.ratio >= 0.8) [tone, status, icon] = ["warning", t("goals.left", { time: fmtDur(limit - p.usedMs) }), "alert"];
    else [tone, status, icon] = ["good", t("goals.left", { time: fmtDur(limit - p.usedMs) }), "check"];
  } else {
    if (p.ratio >= 1) [tone, status, icon] = ["good", t("goals.reached"), "check"];
    else [tone, status, icon] = ["brand", t("goals.toGo", { time: fmtDur(limit - p.usedMs) }), "bolt"];
  }
  const color = `var(--${tone === "brand" ? "brand" : tone})`;
  return (
    <article className={`card goal-card tone-${tone}`}>
      <button className="icon-btn goal-del" onClick={onDelete} aria-label={t("goals.delete")}>
        <Icon name="x" size={14} />
      </button>
      <svg viewBox="0 0 140 140" className="goal-ring" aria-hidden="true">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--track)" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${circ * lap1} ${circ}`} transform="rotate(-90 70 70)" />
        {lap2 > 0 && <circle cx="70" cy="70" r={r} fill="none" stroke={g.op === "max" ? "var(--critical)" : "var(--ink-2)"} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${circ * lap2} ${circ}`} transform="rotate(-90 70 70)" opacity="0.9" />}
        {g.op === "max" && <line x1="70" y1="10" x2="70" y2="26" stroke="var(--ink-2)" strokeWidth="2" strokeLinecap="round" />}
      </svg>
      <div className="goal-center">
        <div className="goal-used">{fmtDur(p.usedMs)}</div>
        <div className="goal-of">{t("goals.of", { time: fmtDur(limit) })}</div>
      </div>
      <div className="goal-text">
        <div className="goal-sentence">
          <GoalSentence g={g} label={label} cat={cat} bold />
        </div>
        <div className="goal-period">{t(g.period === "day" ? "goals.today" : "goals.thisWeek")}</div>
        <div className={`goal-status ${tone}`}>
          <Icon name={icon} size={14} /> {status}
        </div>
      </div>
    </article>
  );
}

function GoalSentence({ g, label, cat, bold }: { g: Goal; label: string; cat?: Category; bold?: boolean }) {
  const t = useT();
  const key = `goals.sentence.${g.op}${g.targetKind === "total" ? "Total" : ""}`;
  const time = fmtDur(g.minutes * 60_000);
  return rich(t(key), {
    time: bold ? <b>{time}</b> : time,
    target: (
      <>
        {cat && <CatDot cat={cat} />} {bold ? <b>{label}</b> : label}
      </>
    ),
  });
}

function Composer({ categories, apps, domains, onAdd }: { categories: Category[]; apps: { key: string; display: string }[]; domains: string[]; onAdd: (g: Omit<Goal, "id">) => void }) {
  const t = useT();
  const catName = useCatName();
  const [op, setOp] = useState<Goal["op"]>("max");
  const [minutes, setMinutes] = useState(60);
  const [target, setTarget] = useState(categories[1] ? `category:${categories[1].id}` : "total:");
  const [period, setPeriod] = useState<Goal["period"]>("day");
  const [kind, key] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)] as [Goal["targetKind"], string];
  return (
    <section className="card composer">
      <div className="composer-label">
        <Icon name="goals" size={16} /> {t("goals.new")}
      </div>
      <div className="sentence">
        <Select
          size="lg"
          value={op}
          onChange={setOp}
          ariaLabel={t("goals.composer.opAria")}
          options={[
            { value: "max" as const, label: t("goals.composer.max") },
            { value: "min" as const, label: t("goals.composer.min") },
          ]}
        />
        <Select size="lg" value={minutes} onChange={setMinutes} ariaLabel={t("goals.composer.durationAria")} options={PRESETS.map((m) => ({ value: m, label: fmtDur(m * 60_000) }))} />
        <Select
          size="lg"
          value={target}
          onChange={setTarget}
          ariaLabel={t("goals.composer.targetAria")}
          options={[
            { value: "total:", label: t("goals.composer.total"), lead: <Icon name="today" size={14} /> },
            ...categories.map((c) => ({ value: `category:${c.id}`, label: t("goals.composer.onTarget", { target: catName(c) }), lead: <CatDot cat={c} />, group: t("week.categories") })),
            ...apps.map((a) => ({ value: `app:${a.key}`, label: t("goals.composer.inApp", { app: a.display }), lead: <Glyph label={a.display} size={18} />, group: t("ledger.apps") })),
            ...domains.map((d) => ({ value: `domain:${d}`, label: t("goals.composer.onTarget", { target: d }), lead: <Glyph label={d} size={18} site />, group: t("ledger.sites") })),
          ]}
        />
        <Select
          size="lg"
          value={period}
          onChange={setPeriod}
          ariaLabel={t("goals.composer.periodAria")}
          options={[
            { value: "day" as const, label: t("goals.composer.eachDay") },
            { value: "week" as const, label: t("goals.composer.eachWeek") },
          ]}
        />
        <button className="btn primary" onClick={() => onAdd({ op, minutes, targetKind: kind, target: key, period })}>
          <Icon name="plus" size={16} /> {t("goals.composer.add")}
        </button>
      </div>
    </section>
  );
}
