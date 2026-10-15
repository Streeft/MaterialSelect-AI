"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface SnackbarOptions {
  /** One line, no icon, no link — the M3 Snackbar says what happened, nothing more. */
  message: string;
  /** At most one action; "Desfazer" is the usual one. */
  action?: { label: string; onAction: () => void };
  /**
   * Runs when the snackbar goes away *without* the action being taken — time
   * ran out, another snackbar replaced it, or the page is being left. A deferred
   * delete commits here.
   */
  onExpire?: () => void;
  /** Milliseconds on screen. An actionable snackbar defaults longer (web a11y). */
  duration?: number;
}

interface SnackbarApi {
  notify: (options: SnackbarOptions) => void;
}

const SnackbarContext = createContext<SnackbarApi | null>(null);

const DURATION_PLAIN = 5000;
const DURATION_ACTION = 8000;

/**
 * The app's snackbar (D-130), after the Material 3 Snackbar guidelines.
 *
 * - **One at a time.** A new one *replaces* the one on screen, and the one it
 *   replaces is expired (so a pending delete is confirmed, never lost). No
 *   queue: a queue turns three quick deletes into 24 seconds of waiting.
 * - **One action, no icon, no link.** What M3 asks of the content.
 * - **It never traps time.** Hover or keyboard focus on it pauses the timer — on
 *   the web, someone who needs longer to read must be able to take it.
 * - **Leaving the page confirms.** `pagehide` expires the current one, since the
 *   timer would not get to run.
 *
 * The state lives in this provider and not in the component that asked, so a
 * snackbar survives the navigation that often follows the action it announces
 * (deleting a notebook sends the reader back to the list).
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(SnackbarOptions & { id: number }) | null>(null);
  const currentRef = useRef<(SnackbarOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(0);
  const startedAt = useRef(0);
  const counter = useRef(0);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Take it off screen. `expired` is false when the action was taken. */
  const close = useCallback((expired: boolean) => {
    const closing = currentRef.current;
    clearTimer();
    currentRef.current = null;
    setCurrent(null);
    if (closing && expired) closing.onExpire?.();
  }, []);

  const arm = useCallback(
    (ms: number) => {
      clearTimer();
      remaining.current = ms;
      startedAt.current = Date.now();
      timer.current = setTimeout(() => close(true), ms);
    },
    [close],
  );

  const notify = useCallback(
    (options: SnackbarOptions) => {
      // The one on screen is confirmed, not dropped.
      currentRef.current?.onExpire?.();
      const next = { ...options, id: ++counter.current };
      currentRef.current = next;
      setCurrent(next);
      arm(options.duration ?? (options.action ? DURATION_ACTION : DURATION_PLAIN));
    },
    [arm],
  );

  const pause = () => {
    if (!timer.current) return;
    clearTimer();
    remaining.current = Math.max(1000, remaining.current - (Date.now() - startedAt.current));
  };
  const resume = () => {
    if (currentRef.current && !timer.current) arm(remaining.current);
  };

  useEffect(() => {
    const flush = () => close(true);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [close]);

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      {/* The live region is always mounted so a screen reader announces the
          text that appears in it; mounting it together with its text is not
          reliably announced. */}
      <div className="msds-snackbar-host" role="status" aria-live="polite">
        {current ? (
          <div
            key={current.id}
            className="msds-snackbar"
            onMouseEnter={pause}
            onMouseLeave={resume}
            onFocus={pause}
            onBlur={resume}
          >
            <span className="msds-snackbar-message">{current.message}</span>
            {current.action ? (
              <button
                type="button"
                className="msds-snackbar-action"
                onClick={() => {
                  current.action?.onAction();
                  close(false);
                }}
              >
                {current.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarApi {
  const api = useContext(SnackbarContext);
  if (!api) throw new Error("useSnackbar fora do SnackbarProvider");
  return api;
}
