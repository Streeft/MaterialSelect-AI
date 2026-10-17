"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` (D-142) once the page has loaded, and only in production:
 * a worker in `next dev` would sit in front of hot reload and serve stale
 * navigations. Registration failing (private window, blocked site data) is not
 * an error the reader can act on, so it is swallowed.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
