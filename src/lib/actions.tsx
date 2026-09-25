
import { useCallback, useState } from "react";
import { Menu, type MenuItem } from "../components/bits";
import { api } from "./ipc";
import { useT } from "./i18n";
import { tourSignal } from "./tour";
import { catColor, useCatName, useStore } from "./store";
import { dayBounds } from "./time";

export interface Target {
  kind: "app" | "domain";
  key: string;
  label: string;
  cat: number | null;

  mixed?: boolean;
}

export function useActions() {
  const { categories, catById, bump, toast, settings, saveSettings, setHighlight, highlight, date } = useStore();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const tr = useT();
  const catName = useCatName();

  const assign = useCallback(
    async (t: Target, categoryId: number) => {
      const id = await api.addRule(t.kind, t.key, categoryId);
      bump();
      toast(tr("actions.assigned", { item: t.label, category: catName(catById.get(categoryId)) }), {
        label: tr("actions.undo"),
        run: async () => {
          await api.deleteRule(id);
          bump();
        },
      });
    },
    [bump, toast, catById, tr, catName],
  );

  const openMenu = useCallback(
    (t: Target, x: number, y: number) => {
      tourSignal("menu");
      const items: MenuItem[] = [
        { heading: true, label: tr(t.mixed ? "actions.defaultFor" : "actions.alwaysCount", { item: t.label }) },
        ...categories.map((c) => ({
          label: catName(c),
          color: catColor(c),
          hint: c.id === t.cat && !t.mixed ? tr("actions.current") : c.kind === "productive" ? tr("kinds.productive") : c.kind === "distracting" ? tr("kinds.distracting") : undefined,
          run: () => assign(t, c.id),
        })),
        { label: "-" },
        {
          label: tr(highlight === t.key ? "actions.stopHighlight" : "actions.highlight"),
          icon: "today",
          run: () => setHighlight(highlight === t.key ? null : t.key),
        },
      ];
      if (t.kind === "app" && settings) {
        const hidden = settings.titleExclusions.includes(t.key);
        items.push(
          {
            label: tr(hidden ? "actions.recordTitles" : "actions.hideTitles"),
            icon: hidden ? "eye" : "eyeOff",
            run: async () => {
              await saveSettings({
                titleExclusions: hidden ? settings.titleExclusions.filter((k) => k !== t.key) : [...settings.titleExclusions, t.key],
              });
              toast(tr(hidden ? "actions.titlesOn" : "actions.titlesOff", { item: t.label }));
            },
          },
          {
            label: tr("actions.ignore"),
            icon: "x",
            run: async () => {
              await saveSettings({ ignoredApps: [...settings.ignoredApps, t.key] });
              toast(tr("actions.ignored", { item: t.label }));
            },
          },
        );
      }
      if (t.kind === "app") {
        items.push({
          label: tr("actions.forgetDay"),
          icon: "trash",
          danger: true,
          run: async () => {
            const [s, e] = dayBounds(date);
            const n = await api.forget(s, e, t.key);
            bump();
            toast(tr("actions.forgot", { count: n, item: t.label }));
          },
        });
      }
      setMenu({ x, y, items });
    },
    [categories, assign, highlight, setHighlight, settings, saveSettings, toast, bump, date, tr, catName],
  );

  const menuEl = menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />;
  return { assign, openMenu, menuEl };
}
