

import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Glyph } from "../components/bits";
import type { Target } from "./actions";
import { useT } from "./i18n";
import { tourSignal } from "./tour";
import { useCatName, useStore } from "./store";

interface DragState {
  target: Target;
  x: number;
  y: number;
  overCat: number | null;
}

const THRESHOLD = 6;

function dropCatAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-cat]");
  return el ? Number(el.dataset.dropCat) : null;
}

export function useItemDrag(onDrop: (t: Target, categoryId: number) => void) {
  const { catById } = useStore();
  const t = useT();
  const catName = useCatName();
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    document.body.classList.toggle("dragging", !!drag);
  }, [drag]);

  const start = useCallback(
    (t: Target) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let active = false;
      const move = (ev: PointerEvent) => {
        if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return;
        if (!active) tourSignal("drag");
        active = true;
        setDrag({ target: t, x: ev.clientX, y: ev.clientY, overCat: dropCatAt(ev.clientX, ev.clientY) });
      };
      const end = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (active) {
          const cat = ev.type === "pointerup" ? dropCatAt(ev.clientX, ev.clientY) : null;
          if (cat !== null) onDrop(t, cat);

          const stop = (c: Event) => c.stopPropagation();
          window.addEventListener("click", stop, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
        }
        setDrag(null);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [onDrop],
  );

  const over = drag?.overCat != null ? catById.get(drag.overCat) : null;
  const ghost = drag && (
    <div className={`drag-ghost ${over ? "over" : ""}`} style={{ left: drag.x + 14, top: drag.y + 12 }} aria-hidden="true">
      <Glyph label={drag.target.label} size={24} site={drag.target.kind === "domain"} />
      <div>
        <b>{drag.target.label}</b>
        <span>{over ? t("drag.onto", { category: catName(over) }) : t("drag.dropHint")}</span>
      </div>
    </div>
  );

  return { start, ghost, overCat: drag?.overCat ?? null, dragging: !!drag };
}
