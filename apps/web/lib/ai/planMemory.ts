/**
 * The project assistant's proposal, kept while the reader goes elsewhere and
 * comes back (D-251, the pending item of D-224).
 *
 * The proposal lives in `sessionStorage`: it survives navigating to the
 * Selection, to a material or to the comparator and back, and a reload of the
 * tab; it dies with the tab and with the logout. Nothing is sent anywhere — it is
 * what the screen already held. The server also reuses the same text for ten
 * minutes without spending quota, but the proposal the reader had EDITED (a limit
 * changed by hand) exists only here, so it is kept here.
 *
 * Every read is shape-checked and every storage call is guarded: a private
 * window, a full quota or a value from another version simply means "no
 * proposal", never an error on the screen.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ProjectPlan } from "@/lib/types";

export type PlanSlot = "inicio" | "selecao";

/** What a slot holds: the text the proposal answered, and the proposal itself. */
export interface RememberedPlan {
  text: string;
  plan: ProjectPlan;
}

const PREFIX = "msai.plan.";
const EVENT = "msai:plan-memory";

const keyOf = (slot: PlanSlot) => `${PREFIX}${slot}`;

function isRememberedPlan(value: unknown): value is RememberedPlan {
  if (typeof value !== "object" || value === null) return false;
  const { text, plan } = value as { text?: unknown; plan?: unknown };
  if (typeof text !== "string" || typeof plan !== "object" || plan === null) return false;
  const { components } = plan as { components?: unknown };
  return Array.isArray(components) && components.length > 0;
}

/** The raw stored text of a slot, or `null`. */
function readRaw(slot: PlanSlot): string | null {
  try {
    return window.sessionStorage.getItem(keyOf(slot));
  } catch {
    return null;
  }
}

export function parseRememberedPlan(raw: string | null): RememberedPlan | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRememberedPlan(value) ? value : null;
  } catch {
    return null;
  }
}

export function writePlanMemory(slot: PlanSlot, value: RememberedPlan | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(keyOf(slot));
    else window.sessionStorage.setItem(keyOf(slot), JSON.stringify(value));
  } catch {
    // Storage refused: the proposal stays on screen and is simply not kept.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Forget every remembered proposal (the logout: the next reader starts clean). */
export function clearPlanMemory(): void {
  try {
    for (const slot of ["inicio", "selecao"] as const) window.sessionStorage.removeItem(keyOf(slot));
  } catch {
    // Nothing to forget where nothing can be stored.
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The slot's remembered proposal, as state. The server render and the first
 * client render see none (storage is the browser's), then the stored one appears
 * — the same as `ResumeWork` does for the draft.
 */
export function usePlanMemory(slot: PlanSlot): {
  saved: RememberedPlan | null;
  save: (value: RememberedPlan | null) => void;
} {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(slot),
    () => null,
  );
  const saved = useMemo(() => parseRememberedPlan(raw), [raw]);
  const save = useCallback((value: RememberedPlan | null) => writePlanMemory(slot, value), [slot]);
  return { saved, save };
}
