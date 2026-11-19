"use client";

import { useSyncExternalStore } from "react";

/**
 * The ambience, the reader's choice (D-256). "Engenharia" is the app as it has always been.
 * "Oficina" dresses the same screens as a workshop: a wooden bench under the page, paper for the
 * panels, graph paper in the wells, brushed steel on the rail, the Catálogo as a cabinet of
 * drawers and the steps of the method drawn as the objects they are on a real bench.
 *
 * It is a costume and nothing else: no number, colour role, quality colour or chart palette moves,
 * and the accessible name of every control is the same in both.
 *
 * Kept on this device, as the theme and the table density are: the head script wears it before
 * first paint (a page-wide texture arriving late is a flash). Storage is wrapped in try/catch; a
 * refused write still applies to this page view.
 */
export type Ambience = "engenharia" | "oficina";

export const AMBIENCES: readonly Ambience[] = ["engenharia", "oficina"];
export const AMBIENCE_STORAGE_KEY = "msai.ambience";
const EVENT = "msai:ambience";

/** Anything but the one known value is the default. */
export function parseAmbience(raw: string | null): Ambience {
  return raw === "oficina" ? "oficina" : "engenharia";
}

/** Runs before first paint, inlined in the head next to the theme's script. */
export const AMBIENCE_BOOTSTRAP_SCRIPT = `!function(){try{if(localStorage.getItem(${JSON.stringify(
  AMBIENCE_STORAGE_KEY,
)})==="oficina")document.documentElement.dataset.ambience="oficina"}catch(e){}}()`;

/** The attribute the CSS reads; the default leaves it off. */
export function applyAmbience(ambience: Ambience, root: HTMLElement): void {
  if (ambience === "oficina") root.dataset.ambience = "oficina";
  else delete root.dataset.ambience;
}

// This tab's own choice wins over storage, so the switch works for the visit even when the write
// was refused.
let chosen: Ambience | null = null;

function stored(): Ambience {
  try {
    return parseAmbience(window.localStorage.getItem(AMBIENCE_STORAGE_KEY));
  } catch {
    return "engenharia";
  }
}

function snapshot(): Ambience {
  return chosen ?? stored();
}

function subscribe(onChange: () => void): () => void {
  // Another tab changed it: follow, and repaint this document too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== AMBIENCE_STORAGE_KEY) return;
    chosen = null;
    applyAmbience(stored(), document.documentElement);
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function setAmbience(ambience: Ambience): void {
  try {
    window.localStorage.setItem(AMBIENCE_STORAGE_KEY, ambience);
  } catch {
    // Not remembered on this device.
  }
  chosen = ambience;
  applyAmbience(ambience, document.documentElement);
  window.dispatchEvent(new Event(EVENT));
}

/** The server renders the default; the head script has already put the attribute on. */
export function useAmbience(): Ambience {
  return useSyncExternalStore(subscribe, snapshot, () => "engenharia");
}
