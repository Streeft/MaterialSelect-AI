"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MdDialog } from "./material/elements";

/**
 * Modal dialog, on top of @material/web's md-dialog.
 *
 * md-dialog owns its own focus trap (two sentinel divs bracketing its
 * content, redirecting Tab at the edges) and its own open/close animation —
 * neither is reimplemented here. `useFocusTrap` (`focusTrap.ts`) is no
 * longer used by this component, but the hook is not dead code: the mobile
 * drawer in `AppSidebar` depends on it independently.
 *
 * `open` is passed straight through as an element *property* (@lit/react's
 * createComponent() sees "open" on Dialog.prototype and assigns it
 * directly), which is the same setter md-dialog uses internally to call its
 * own show()/close(). Every way of closing — Escape, a scrim click, or a
 * footer button calling `onClose` directly — ends up dispatching md-dialog's
 * native `close` event, wired once in `material/elements.ts`.
 *
 * Two losses accepted in this retema, both because md-dialog's template has
 * no hook for them: there is no built-in "X" close affordance (M3 dialogs
 * close via Escape, the scrim, or an explicit action — this call site's
 * `footer` already provides one), and `description` renders as the first
 * line of `content` rather than through `aria-describedby` (md-dialog's own
 * render() never wires that attribute from the host down to the internal
 * `<dialog>`, so there is nothing to attach it to).
 *
 * The content wrapper carries a real `autofocus` attribute so opening moves
 * focus into the dialog's body instead of onto whatever control happens to
 * be first in DOM order — md-dialog's own `show()` already looks for
 * `[autofocus]` in its light DOM before falling back to the browser's
 * "first tabbable descendant" rule.
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
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.setAttribute("autofocus", "");
  }, []);

  // md-dialog traps focus while open but, unlike the old hand-rolled
  // implementation, never gives it back on close — there is no hook in its
  // render() for that. Restore it ourselves: remember what was focused right
  // before opening (the trigger, focused by the click that set `open`), and
  // return focus there when `open` goes false, by any path (Escape, scrim,
  // or a footer button calling `onClose` directly).
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <MdDialog open={open} onClose={onClose} className={className}>
      <div slot="headline">{title}</div>
      <div ref={contentRef} slot="content" tabIndex={-1} className={cn("outline-none")}>
        {description ? <p className="mb-2 text-xs text-ink-muted">{description}</p> : null}
        {children}
      </div>
      {footer ? <div slot="actions">{footer}</div> : null}
    </MdDialog>
  );
}
