"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Announce = (message: string) => void;

const AnnouncerContext = createContext<Announce | null>(null);

/**
 * One polite live region for the whole app (D-146).
 *
 * A change the eyes see and the ears do not — a ranking that finished, a step
 * that changed — is spoken through it. The region is mounted with the provider,
 * empty: text inserted into a region that already exists is announced, while a
 * region mounted together with its text often is not. The same sentence twice in
 * a row is made distinct with a trailing no-break space, or the second would be
 * read as no change at all.
 *
 * It is for what the reader did not type. Text that already sits in its own
 * `role="status"` (the snackbar, the draft indicator) stays there.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const announce = useCallback<Announce>((next) => {
    setMessage((prev) => (prev === next ? `${next} ` : next));
  }, []);
  const value = useMemo(() => announce, [announce]);
  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

/** Speak `message` politely. A no-op outside the provider (tests, `/estilo`). */
export function useAnnounce(): Announce {
  return useContext(AnnouncerContext) ?? noop;
}

const noop: Announce = () => {};
