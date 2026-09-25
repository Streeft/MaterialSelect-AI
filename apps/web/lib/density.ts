"use client";

import { useSyncExternalStore } from "react";

/**
 * Table density, the reader's choice (D-91).
 *
 * One preference for every table in the app, not one per screen: someone who
 * works through a long catalogue wants the compact rows in the comparator too,
 * and a toggle that only reached the table beside it would have to be found
 * again on each route.
 *
 * It is a per-viewer convenience, so it lives in `localStorage` — wrapped,
 * because the accessor can throw (private window, blocked storage) and a table
 * must still render at its default when it does. Changes are broadcast with a
 * same-tab event as well as `storage`, which only fires in *other* tabs.
 */
export type TableDensity = "comfortable" | "compact";

const KEY = "msai-table-density";
const EVENT = "msai:table-density";

// This tab's own choice, once made. It wins over storage so the toggle works
// for the visit even when storage refused the write, instead of snapping back.
let densityOverride: TableDensity | null = null;

function read(): TableDensity {
  try {
    return window.localStorage.getItem(KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
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

export function setTableDensity(density: TableDensity): void {
  try {
    window.localStorage.setItem(KEY, density);
  } catch {
    // Storage refused: the choice still applies to this page view.
  }
  densityOverride = density;
  window.dispatchEvent(new Event(EVENT));
}

function snapshot(): TableDensity {
  return densityOverride ?? read();
}

export function useTableDensity(): TableDensity {
  // The server always renders the default: the preference is only known in
  // the browser, and a mismatch there would be a hydration error.
  return useSyncExternalStore(subscribe, snapshot, () => "comfortable");
}
