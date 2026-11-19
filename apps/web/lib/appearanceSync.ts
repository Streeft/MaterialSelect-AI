/**
 * Keeping the appearance on the account as well as on the device (D-249).
 *
 * The device copy (`lib/appearance.ts`) is what the page wears and what the head script reads before
 * first paint. This module is the other half: once, when the signed-in app opens, it asks the
 * account what it has —
 *
 * - the account **has** a choice: it wins, and is worn here (the point of the feature: the colour
 *   picked on the laptop is on the phone). It is written to the device copy too, so the next paint
 *   is already right;
 * - the account has **none** and this device has a non-default choice: the device offers it to the
 *   account, once, so a choice made before D-249 is not lost;
 * - the account cannot be reached: the device copy stands, and the Aparência page says it is only
 *   here for now.
 *
 * and afterwards every change the reader makes is sent to the account, the latest one after a
 * short pause (a row of clicks on the contrast buttons is one write). A failed write is not an
 * error to shout about: the device already wears it. The state it leaves is shown, in words, on the
 * Aparência page.
 */
import {
  getAccountAppearance,
  putAccountAppearance,
  type AccountAppearance,
} from "./api";
import {
  adoptAppearance,
  DEFAULT_APPEARANCE,
  readAppearance,
  sameAppearance,
  setAppearanceChangeHandler,
  type Appearance,
} from "./appearance";

/** `idle`: nothing sent yet · `saving` · `saved` on the account · `local`: only on this device. */
export type SyncState = "idle" | "saving" | "saved" | "local";

let state: SyncState = "idle";
const listeners = new Set<() => void>();

export function syncState(): SyncState {
  return state;
}

export function serverSyncState(): SyncState {
  return "idle";
}

export function subscribeSyncState(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function setState(next: SyncState): void {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

export interface SyncDeps {
  get: () => Promise<AccountAppearance>;
  put: (body: Appearance) => Promise<unknown>;
  /** The pause before a change is sent, so a burst of clicks is one write. */
  debounceMs: number;
}

/** Read when the sync starts, not when the module loads: a screen that never signs in costs nothing. */
const real = (): SyncDeps => ({ get: getAccountAppearance, put: putAccountAppearance, debounceMs: 400 });

/**
 * Starts the sync for the signed-in reader. Returns how to stop it (an unmounted app must not
 * keep writing). Safe to call twice: the second call replaces the first's handler.
 */
export function startAppearanceSync(deps: Partial<SyncDeps> = {}): () => void {
  const { get, put, debounceMs } = { ...real(), ...deps };
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // The newest choice not yet on the account; a write in flight is never overtaken by an older one.
  let pending: Appearance | null = null;
  let sending = false;

  async function flush(): Promise<void> {
    if (sending || pending === null || stopped) return;
    sending = true;
    setState("saving");
    let failed = false;
    while (pending !== null && !stopped) {
      const body = pending;
      pending = null;
      try {
        await put(body);
      } catch {
        failed = true;
      }
    }
    sending = false;
    if (!stopped) setState(failed ? "local" : "saved");
  }

  function schedule(next: Appearance): void {
    pending = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  }

  const unregister = setAppearanceChangeHandler(schedule);

  void (async () => {
    try {
      const remote = await get();
      if (stopped) return;
      if (remote.saved) {
        // A change made here while the request was in flight is newer than the account's copy.
        if (pending === null) {
          adoptAppearance({
            color: remote.color,
            contrast: remote.contrast,
            motion: remote.motion,
            rail: remote.rail,
          });
          setState("saved");
        } else {
          setState("saving");
        }
      } else if (!sameAppearance(readAppearance(), DEFAULT_APPEARANCE)) {
        // A choice made before the account kept one: offer it, once.
        schedule(readAppearance());
        await flush();
      }
    } catch {
      if (!stopped) setState("local");
    }
  })();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unregister();
  };
}

/** For tests: back to the state of a page that just loaded. */
export function resetSyncStateForTests(): void {
  state = "idle";
  for (const listener of listeners) listener();
}
