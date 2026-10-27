/**
 * Keyboard shortcuts for moving around the app (D-169).
 *
 * "g" followed by a letter goes to a screen, the way Gmail and Drive do it; "?"
 * opens the list. Single-character shortcuts must be switchable off (WCAG 2.1.4,
 * for people who dictate or whose keys fire by accident), so the preference
 * lives in `localStorage`, and the global search's own Ctrl/Cmd+K is not
 * affected by it.
 */

export interface Shortcut {
  /** The key pressed after "g". */
  key: string;
  href: string;
  /** Key in `ptBR.nav` that names the destination. */
  label:
    | "home"
    | "selection"
    | "maps"
    | "compare"
    | "notebooks"
    | "solver"
    | "cost"
    | "eco"
    | "battery"
    | "catalog"
    | "processes"
    | "myRecords";
}

/** One destination per letter; the letter is the initial where it is free. */
export const SHORTCUTS: readonly Shortcut[] = [
  { key: "i", href: "/app", label: "home" },
  { key: "s", href: "/app/selecao", label: "selection" },
  { key: "m", href: "/app/mapas", label: "maps" },
  { key: "c", href: "/app/comparar", label: "compare" },
  { key: "n", href: "/app/cadernos", label: "notebooks" },
  { key: "d", href: "/app/dimensionar", label: "solver" },
  { key: "u", href: "/app/custo", label: "cost" },
  { key: "e", href: "/app/eco", label: "eco" },
  { key: "b", href: "/app/baterias", label: "battery" },
  { key: "t", href: "/app/catalogo", label: "catalog" },
  { key: "p", href: "/app/processos", label: "processes" },
  { key: "r", href: "/app/meus-registros", label: "myRecords" },
];

export function shortcutFor(key: string): Shortcut | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.key === key.toLowerCase());
}

/** How long "g" waits for the letter that completes it. */
export const SEQUENCE_MS = 1500;

export const SHORTCUTS_STORAGE_KEY = "msai.shortcuts";

/** On unless the reader switched it off; storage that throws means "on". */
export function readShortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

/** For `useSyncExternalStore`: the preference changes in this tab or in another. */
export function subscribeShortcutsEnabled(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHORTCUTS_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function writeShortcutsEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.removeItem(SHORTCUTS_STORAGE_KEY);
    else window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, "off");
  } catch {
    // Private windows and blocked site data throw; the preference then lasts until reload.
  }
  listeners.forEach((notify) => notify());
}
