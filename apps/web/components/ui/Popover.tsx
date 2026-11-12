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
import { ptBR } from "@/lib/i18n";
import { useWindowClass } from "@/lib/useWindowClass";
import { IconChevronRight, IconClose } from "./icons";

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
 *
 * D-197: on a compact window (under 600 px) the same content opens as an M3
 * modal bottom sheet (m3.material.io › Components › Bottom sheets): a 288 px
 * panel pinned to a tapped value is too small to read on a phone, and the
 * thumb is at the bottom. Modal there — a scrim, focus moved in and kept in,
 * the page behind not scrolling, focus back on the value when it closes.
 */
export function Popover({
  trigger,
  label,
  title,
  align = "start",
  className,
  panelClassName,
  triggerClassName,
  children,
}: {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  /** Accessible name for the trigger — it is usually an icon or a bare value. */
  label: string;
  /** D-197: the bottom sheet's heading on a phone; the trigger's `label` when absent. */
  title?: string;
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
  /** D-206: replaces the bare-text trigger look (a filter chip draws itself). */
  triggerClassName?: string;
  /** D-206: a function receives `close`, for a panel whose choice ends it (a filter option). */
  children: ReactNode | ((close: () => void) => ReactNode);
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
  const headingId = useId();
  // Behaviour, not layout (D-182): which surface opens is decided by the window.
  const sheet = useWindowClass() === "compact";

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
      // document with no idea what closed. A sheet is modal: it always does.
      if (restoreFocus || sheet) triggerRef.current?.focus();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
      // The sheet keeps focus inside it, as any modal does.
      if (sheet && event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
          event.preventDefault();
          first.focus();
        }
      }
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
  }, [open, place, sheet]);

  // The sheet takes focus when it opens, and the page behind stops scrolling.
  useEffect(() => {
    if (!open || !sheet) return;
    panelRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, sheet]);

  function closeSheet() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  // D-206: a panel that closes itself (a filter option picked) only flips the
  // state; giving focus back to the trigger happens after, in an effect,
  // because a callback handed to children during render may not touch refs.
  const content =
    typeof children === "function" ? children(() => setOpen(false)) : children;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // Focus fell to <body> with the panel it was in: hand it back to the trigger.
    if (document.activeElement === document.body || document.activeElement === null) {
      triggerRef.current?.focus();
    }
  }, [open]);

  const sheetPanel =
    open && sheet && typeof document !== "undefined"
      ? createPortal(
          <>
            <div aria-hidden className="m3-sheet-scrim" />
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              tabIndex={-1}
              className="m3-bottom-sheet"
            >
              <span aria-hidden className="m3-bottom-sheet-handle" />
              <div className="flex items-start justify-between gap-3">
                <h2 id={headingId} className="text-heading font-semibold text-ink">
                  {title ?? label}
                </h2>
                <button type="button" onClick={closeSheet} aria-label={ptBR.ui.close} className="m3-bottom-sheet-close">
                  <IconClose className="h-5 w-5" />
                </button>
              </div>
              <div className={cn("text-body text-ink", panelClassName)}>{content}</div>
            </div>
          </>,
          document.body,
        )
      : null;

  const panel =
    open && !sheet && position && typeof document !== "undefined"
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
              "fixed z-50 animate-fade-in overflow-y-auto rounded-card border border-edge bg-surface-raised p-3 text-left text-caption text-ink shadow-overlay",
              panelClassName,
            )}
          >
            {content}
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
        className={triggerClassName ?? "inline-flex items-center gap-1 rounded text-left transition hover:text-brand"}
      >
        {trigger}
      </button>
      {panel}
      {sheetPanel}
    </span>
  );
}

/**
 * Progressive disclosure for a block of detail that is not worth a popover —
 * long lists, secondary tables, the "why was this excluded" explanations — and,
 * since D-85, the "Opções avançadas" of a guided screen.
 *
 * Uncontrolled by default (`defaultOpen`), which is all a static block needs.
 * Controlled (`open` + `onOpenChange`) when the screen has to open it itself —
 * a loaded study that already uses an advanced option must never keep that
 * option hidden behind a closed summary.
 */
export function Disclosure({
  summary,
  defaultOpen = false,
  open,
  onOpenChange,
  id,
  flush = false,
  className,
  children,
}: {
  summary: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  id?: string;
  /**
   * D-91: inside a card, the disclosure is a divider and a summary line, not
   * a second bordered box — no card inside a card.
   */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const controlled = open !== undefined;
  return (
    <details
      id={id}
      open={controlled ? open : defaultOpen}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        // `toggle` also fires when React itself sets `open`; only report a
        // change the reader made, or a controlled parent loops on its own echo.
        if (controlled && next === open) return;
        onOpenChange?.(next);
      }}
      className={cn(
        "group",
        flush ? "border-t border-line-divider" : "rounded-card border border-line bg-panel",
        className,
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 py-2.5 text-body font-medium text-ink marker:content-[''] [&::-webkit-details-marker]:hidden",
          flush ? "px-0 pt-3" : "px-4",
        )}
      >
        <IconChevronRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-90"
        />
        <span className="min-w-0 flex-1">{summary}</span>
      </summary>
      <div className={flush ? "pt-2" : "border-t border-line-divider p-4"}>{children}</div>
    </details>
  );
}
