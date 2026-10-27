import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Whether the browser believes it has a connection. `navigator.onLine` is only
 * a hint (a captive portal still says `true`), so it chooses which sentence to
 * write — never whether data is shown. The server snapshot is `true`: the
 * first paint never claims the reader is offline.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
