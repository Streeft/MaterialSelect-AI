"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const PANEL_WIDTH = 288; // w-72, in pixels — the positioner needs a number.
const GAP = 6;
const MARGIN = 8;

/**
 * A small disclosure anchored to its trigger.
 *
 * Click-triggered rather than hover-triggered: the provenance of a value has to
 * be reachable on a touch screen and from the keyboard, and hover is neither.
 *
 * The panel is rendered in a portal for two reasons that are both bugs
 * otherwise. Most of these triggers sit in table cells, and a table lives
 * inside `overflow-x: auto` — an absolutely positioned panel would be clipped
 * by its own scroll container. And the trigger is often inline in prose, where
 * a `<div>` panel would be invalid inside the surrounding `<p>` and would make
 * React tear down the whole tree at hydration.
 */
export function Popover({
  trigger,
  label,
  align = "start",
  className,
  panelClassName,
  children,
}: {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  /** Accessible name for the trigger — it is usually an icon or a bare value. */
  label: string;
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    above: boolean;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = align === "end" ? rect.right - PANEL_WIDTH : rect.left;
    // Below by default; above when the trigger sits low enough that a panel
    // under it would open off-screen. Clamped horizontally so a cell at the far
    // right of a wide table does not push the panel out of the viewport.
    const above = rect.bottom > window.innerHeight * 0.6;
    setPosition({
      top: above ? rect.top - GAP : rect.bottom + GAP,
      left: Math.max(MARGIN, Math.min(left, window.innerWidth - PANEL_WIDTH - MARGIN)),
      above,
    });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const close = (restoreFocus: boolean) => {
      setOpen(false);
      // Escape must give focus back, or the reader is dropped at the top of the
      // document with no idea what closed.
      if (restoreFocus) triggerRef.current?.focus();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close(false);
    };
    // `true` for capture: a scroll inside a table container does not bubble to
    // window, and a panel that stays behind while its anchor moves is worse
    // than one that simply follows.
    const onScrollOrResize = () => place();

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, place]);

  const panel =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={label}
            style={{
              top: position.top,
              left: position.left,
              width: PANEL_WIDTH,
              transform: position.above ? "translateY(-100%)" : undefined,
              maxHeight: position.above ? position.top - MARGIN : undefined,
            }}
            className={cn(
              "fixed z-50 animate-fade-in overflow-y-auto rounded-card border border-edge bg-surface-raised p-3 text-left text-xs text-ink shadow-overlay",
              panelClassName,
            )}
          >
            {children}
          </div>,
          document.body,
        )
      : null;

  return (
    <span className={cn("inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded text-left transition hover:text-brand"
      >
        {trigger}
      </button>
      {panel}
    </span>
  );
}

/**
 * Progressive disclosure for a block of detail that is not worth a popover —
 * long lists, secondary tables, the "why was this excluded" explanations.
 */
export function Disclosure({
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  summary: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("rounded-card border border-edge bg-surface-raised", className)}
    >
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-ink marker:content-['']">
        {summary}
      </summary>
      <div className="border-t border-edge-subtle p-4">{children}</div>
    </details>
  );
}
