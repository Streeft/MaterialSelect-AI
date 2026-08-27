"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MdDialog } from "./material/elements";

/**
 * Dialog, on top of @material/web's md-dialog.
 *
 * md-dialog renders a native <dialog> internally and owns the whole open/close
 * lifecycle itself: Escape dispatches a cancelable `cancel` event on that
 * native element (real browsers do this for free; jsdom needs the polyfill in
 * vitest.setup.ts), the scrim is its own, and closing either way redispatches
 * as the host's `close` event — which is all `onClose` below listens for
 * (`events: {onClose: "close"}` in material/elements.ts). There is no
 * "Fechar" button of our own to render or trap Tab into; closing is Escape,
 * the scrim, or an explicit `footer` action.
 *
 * Two things this component still owns, because md-dialog does not:
 * - Focus restoration. md-dialog moves focus in on open (see below) and
 *   traps it while open, but never remembers what had focus before — that's
 *   this `useEffect`, the same "remember, then give back" shape the old
 *   hand-rolled dialog used.
 * - Marking what should receive focus on open. md-dialog's own show() does
 *   `this.querySelector('[autofocus]')` on the *host* element, which sees
 *   slotted light-DOM content because it queries before slot distribution —
 *   a shadow-root-scoped query could not. That query wants the literal
 *   `autofocus` HTML attribute; React's `autoFocus` prop does not set it on
 *   a plain `<div>` — it only calls `.focus()` once at mount, which for this
 *   always-mounted wrapper fires while the native <dialog> is still closed
 *   and does nothing. The `ref` below sets the real attribute instead, so
 *   it's there whenever show() actually queries for it. `tabIndex={-1}`
 *   keeps it a legitimate focus target without joining the Tab order itself.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
    } else if (previouslyFocused.current) {
      previouslyFocused.current.focus();
      previouslyFocused.current = null;
    }
  }, [open]);

  return (
    <MdDialog open={open} onClose={onClose} className={cn(className)}>
      <div slot="headline">{title}</div>
      <div slot="content" ref={(el) => el?.setAttribute("autofocus", "")} tabIndex={-1}>
        {description ? <p className="mb-2 text-sm text-ink-muted">{description}</p> : null}
        {children}
      </div>
      {footer ? <div slot="actions">{footer}</div> : null}
    </MdDialog>
  );
}
