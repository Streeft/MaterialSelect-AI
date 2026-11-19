"use client";

/**
 * The hook over {@link ./planMemory}: the slot's remembered proposal as state (D-251).
 * Kept apart from the storage functions because `lib/api.ts` (which the server
 * rendered pages import) calls `clearPlanMemory` on logout and must not pull a React
 * hook into a Server Component.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  PLAN_MEMORY_EVENT,
  parseRememberedPlan,
  readRaw,
  writePlanMemory,
  type PlanSlot,
  type RememberedPlan,
} from "./planMemory";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(PLAN_MEMORY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PLAN_MEMORY_EVENT, onChange);
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
