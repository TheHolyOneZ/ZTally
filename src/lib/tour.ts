

const EVENT = "ztally-tour";

export type TourSignal = "dial" | "menu" | "drag" | "rail" | "palette";

export function tourSignal(name: TourSignal) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: name }));
}

export function onTourSignal(fn: (name: TourSignal) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<TourSignal>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
