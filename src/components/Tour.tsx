

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { onTourSignal, type TourSignal } from "../lib/tour";
import { Icon } from "./Icon";

interface Step {
  id: string;

  target: string[];
  until?: TourSignal[];
}

const STEPS: Step[] = [
  { id: "dial", target: ['[data-tour="dial"]'], until: ["dial"] },
  { id: "legend", target: ['[data-tour="legend"]'] },
  { id: "ledger", target: ['[data-tour="ledger"] .lrow', '[data-tour="ledger"]'], until: ["menu", "drag"] },
  { id: "focus", target: ['[data-tour="focus"]', '[data-tour="dial"]'] },
  { id: "rail", target: [".rail-panel"], until: ["rail"] },
  { id: "palette", target: [".palette-btn"], until: ["palette"] },
  { id: "status", target: [".rail-status"] },
];

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_W = 320;

function find(step: Step): HTMLElement | null {
  for (const sel of step.target) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.getClientRects().length) return el;
  }
  return null;
}

export function Tour() {
  const { tour, setTour, setView, setDate, setPaletteOpen, toast } = useStore();
  const t = useT();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [done, setDone] = useState(false);
  const step = STEPS[i];


  useEffect(() => {
    if (!tour) return;
    setI(0);
    setView("today");
    setDate(new Date());
  }, [tour]);


  useLayoutEffect(() => {
    if (!tour) return;
    let raf = 0;
    const loop = () => {
      const el = find(step);
      const r = el?.getBoundingClientRect();
      setBox((prev) => {
        if (!r) return null;
        const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
        return prev && Math.abs(prev.top - next.top) + Math.abs(prev.left - next.left) + Math.abs(prev.width - next.width) + Math.abs(prev.height - next.height) < 1 ? prev : next;
      });
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [tour, i]);

  const next = () => {
    setDone(false);
    if (i + 1 >= STEPS.length) {
      setTour(false);
      toast(t("tour.finished"));
    } else setI(i + 1);
  };


  const live = useRef({ step, done, next });
  live.current = { step, done, next };
  useEffect(() => {
    if (!tour) return;
    return onTourSignal((s) => {
      const { step: cur, done: isDone } = live.current;
      if (!cur.until?.includes(s) || isDone) return;
      setDone(true);
      setTimeout(() => {
        if (s === "palette") setPaletteOpen(false);
        live.current.next();
      }, 900);
    });
  }, [tour]);

  if (!tour) return null;


  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let cardStyle: React.CSSProperties = { left: vw / 2 - CARD_W / 2, top: vh / 2 - 90 };
  if (box) {
    const right = box.left + box.width + 14;
    const left = box.left - CARD_W - 14;
    const top = Math.min(Math.max(12, box.top), vh - 240);
    if (right + CARD_W < vw - 12) cardStyle = { left: right, top };
    else if (left > 12) cardStyle = { left, top };
    else cardStyle = { left: Math.min(Math.max(12, box.left), vw - CARD_W - 12), top: box.top + box.height + 14 > vh - 220 ? Math.max(12, box.top - 220) : box.top + box.height + 14 };
  }

  const interactive = !!step.until && !!box && !(step.id === "ledger" && !document.querySelector('[data-tour="ledger"] .lrow'));

  return (
    <div className="tour" aria-live="polite">
      {box ? <div className={`tour-spot ${done ? "done" : ""}`} style={box} /> : <div className="tour-dim" />}
      <div className="tour-card" style={{ ...cardStyle, width: CARD_W }} role="dialog" aria-label={t("tour.aria")}>
        <div className="tour-top">
          <span className="tour-count">
            {i + 1} / {STEPS.length}
          </span>
          <button className="tour-skip" onClick={() => setTour(false)}>
            {t("tour.skip")}
          </button>
        </div>
        <h3>{t(`tour.${step.id}.title`)}</h3>
        <p>{t(`tour.${step.id}.body`)}</p>
        {interactive ? (
          <div className={`tour-try ${done ? "done" : ""}`}>
            <Icon name={done ? "check" : "cursor"} size={15} />
            <span>{done ? t("tour.nice") : t(`tour.${step.id}.try`)}</span>
          </div>
        ) : null}
        <div className="tour-nav">
          <div className="tour-dots" aria-hidden="true">
            {STEPS.map((s, k) => (
              <span key={s.id} className={k === i ? "on" : k < i ? "past" : ""} />
            ))}
          </div>
          {i > 0 && (
            <button className="btn sm ghost" onClick={() => (setDone(false), setI(i - 1))}>
              {t("onboarding.back")}
            </button>
          )}
          <button className={`btn sm ${interactive && !done ? "ghost" : "primary"}`} onClick={next}>
            {i + 1 >= STEPS.length ? t("tour.finish") : interactive && !done ? t("tour.skipStep") : t("onboarding.continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
