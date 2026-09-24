"use client";

import { useEffect, useState } from "react";

/**
 * Debounce a rapidly-changing value.
 *
 * Pass a **primitive** — a serialized request, not the request object. An
 * object built during render is a new object every render, so the timer would
 * reset forever and the debounced value would never settle.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
