/**
 * What the menu remembers for this reader on this device (D-207): the pages and
 * records visited last ("Recentes"), the ones they pinned ("Fixados") and which
 * menu groups they folded.
 *
 * All three live in `localStorage`, read through `useSyncExternalStore` so the
 * server render (which cannot see storage) and the first client render agree,
 * and every read and write is wrapped: a private window or blocked site data
 * throws, and then the memory lasts until reload instead of breaking the menu.
 * Nothing here is product data — losing it costs a click, never a record.
 */

import { useSyncExternalStore } from "react";

export interface NavEntry {
  href: string;
  label: string;
}

export const RECENTS_KEY = "msai.nav.recents";
export const PINNED_KEY = "msai.nav.pinned";
export const COLLAPSED_GROUPS_KEY = "msai.nav.groups";
/** D-232: the whole address of the map last opened, filters and selection included. */
export const MAP_URL_KEY = "msai.nav.mapUrl";

/** Longest address kept: a lasso of hundreds of ids is not worth a megabyte of storage. */
export const MAX_MAP_URL_LENGTH = 4000;

/** Stored; the menu shows fewer (see `SHOWN_RECENTS`). */
export const MAX_RECENTS = 8;
export const SHOWN_RECENTS = 5;
export const MAX_PINNED = 12;

function isEntry(value: unknown): value is NavEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.href === "string" &&
    entry.href.startsWith("/app") &&
    typeof entry.label === "string" &&
    entry.label.length > 0
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** The map's own address and nothing else: same site, same page, query string only. */
function isMapUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_MAP_URL_LENGTH &&
    (value === "/app/mapas" || value.startsWith("/app/mapas?"))
  );
}

interface ListStore<T> {
  get: () => readonly T[];
  getServer: () => readonly T[];
  set: (next: readonly T[]) => void;
  reset: () => void;
  subscribe: (onChange: () => void) => () => void;
}

function createListStore<T>(key: string, isItem: (value: unknown) => value is T): ListStore<T> {
  const empty: readonly T[] = [];
  let cachedRaw: string | null | undefined;
  let cached: readonly T[] = empty;
  // What was last written, for when storage refuses to keep it.
  let memoryRaw: string | null = null;
  // The last write did not reach storage: until one does, memory is the truth.
  let writeFailed = false;
  const listeners = new Set<() => void>();

  function readRaw(): string | null {
    if (writeFailed) return memoryRaw;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryRaw;
    }
  }

  function parse(raw: string | null): readonly T[] {
    if (!raw) return empty;
    try {
      const value: unknown = JSON.parse(raw);
      return Array.isArray(value) ? value.filter(isItem) : empty;
    } catch {
      return empty;
    }
  }

  return {
    get() {
      const raw = readRaw();
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cached = parse(raw);
      }
      return cached;
    },
    getServer: () => empty,
    set(next) {
      const raw = JSON.stringify(next);
      memoryRaw = raw;
      try {
        window.localStorage.setItem(key, raw);
        writeFailed = false;
      } catch {
        writeFailed = true;
      }
      listeners.forEach((notify) => notify());
    },
    reset() {
      memoryRaw = null;
      writeFailed = false;
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Nothing stored to forget.
      }
      listeners.forEach((notify) => notify());
    },
    subscribe(onChange) {
      listeners.add(onChange);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

const recents = createListStore<NavEntry>(RECENTS_KEY, isEntry);
const pinned = createListStore<NavEntry>(PINNED_KEY, isEntry);
const collapsedGroups = createListStore<string>(COLLAPSED_GROUPS_KEY, isString);
// One entry at most: the last map, and what it was asked.
const mapUrl = createListStore<string>(MAP_URL_KEY, isMapUrl);

/** Forgets the recents, the pins and the folds (and any in-memory fallback). */
export function resetNavMemory(): void {
  recents.reset();
  pinned.reset();
  collapsedGroups.reset();
  mapUrl.reset();
}

/**
 * Remembers the map as the reader left it (D-232): path *and* query, so the
 * home's "Último mapa" reopens the same axes, filters and selection and not
 * just the page. An address that is not the map's, or too long to be worth
 * storing, is not kept — the card then falls back to the path.
 */
export function recordMapUrl(url: string): void {
  if (!isMapUrl(url)) return;
  if (mapUrl.get()[0] === url) return;
  mapUrl.set([url]);
}

/** Most recent first; a page visited again moves to the top with its newest name. */
export function recordRecent(entry: NavEntry): void {
  const current = recents.get();
  if (current[0]?.href === entry.href && current[0].label === entry.label) return;
  recents.set([entry, ...current.filter((e) => e.href !== entry.href)].slice(0, MAX_RECENTS));
}

export function isPinned(list: readonly NavEntry[], href: string): boolean {
  return list.some((entry) => entry.href === href);
}

/** Pins at the end (the order they were chosen in), or unpins. */
export function togglePinned(entry: NavEntry): void {
  const current = pinned.get();
  if (isPinned(current, entry.href)) {
    pinned.set(current.filter((e) => e.href !== entry.href));
  } else {
    pinned.set([...current, entry].slice(-MAX_PINNED));
  }
}

export function toggleGroupCollapsed(id: string): void {
  const current = collapsedGroups.get();
  collapsedGroups.set(
    current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
  );
}

export function useRecents(): readonly NavEntry[] {
  return useSyncExternalStore(recents.subscribe, recents.get, recents.getServer);
}

/** The last map's whole address, or null when none was kept. */
export function useMapUrl(): string | null {
  const list = useSyncExternalStore(mapUrl.subscribe, mapUrl.get, mapUrl.getServer);
  return list[0] ?? null;
}

export function usePinned(): readonly NavEntry[] {
  return useSyncExternalStore(pinned.subscribe, pinned.get, pinned.getServer);
}

export function useCollapsedGroups(): readonly string[] {
  return useSyncExternalStore(
    collapsedGroups.subscribe,
    collapsedGroups.get,
    collapsedGroups.getServer,
  );
}
