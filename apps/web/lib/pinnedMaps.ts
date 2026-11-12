/**
 * D-220: the maps a reader pinned to the Início — a saved map's id and name, on
 * this device (as the appearance, D-196; the plan of the screen review keeps
 * layouts on the device until the account holds them). Nothing of the map's
 * content is kept here: opening a pin asks the server for the saved map again,
 * so a pin never shows a number the server did not just send.
 *
 * Every storage access is guarded: a private window or a blocked storage reads
 * as "no pins", never as an error.
 */
import { useSyncExternalStore } from "react";

export interface PinnedMap {
  id: number;
  name: string;
}

const KEY = "msai:pinned-maps";
const EVENT = "msai:pinned-maps";
const EMPTY: readonly PinnedMap[] = [];

let cachedRaw: string | null = null;
let cachedValue: readonly PinnedMap[] = EMPTY;

function parse(raw: string | null): readonly PinnedMap[] {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY;
    return data.filter(
      (item): item is PinnedMap =>
        typeof item === "object" &&
        item !== null &&
        Number.isInteger((item as PinnedMap).id) &&
        typeof (item as PinnedMap).name === "string",
    );
  } catch {
    return EMPTY;
  }
}

export function readPinnedMaps(): readonly PinnedMap[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

function write(next: readonly PinnedMap[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage refused: the pin simply does not stick.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function pinMap(map: PinnedMap) {
  const current = readPinnedMaps().filter((m) => m.id !== map.id);
  write([...current, map]);
}

export function unpinMap(id: number) {
  write(readPinnedMaps().filter((m) => m.id !== id));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The pinned maps, live; empty during server rendering. */
export function usePinnedMaps(): readonly PinnedMap[] {
  return useSyncExternalStore(subscribe, readPinnedMaps, () => EMPTY);
}
