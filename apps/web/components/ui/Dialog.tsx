"use client";

import { type ReactNode } from "react";
import { Dialog as MsdsDialog } from "@/lib/msds";

/**
 * Dialog, on top of MSDS's own `Dialog` (D-77).
 *
 * Unlike the `@material/web` version this replaces, MSDS's `Dialog` is not a
 * wrapper around a native `<dialog>` — it is a plain backdrop/surface pair
 * (`.msds-dialog-backdrop` / `.msds-dialog`) with its own focus handling,
 * ported in D-74 (`useFocusTrap`, `lib/msds/msds.tsx`):
 * - **Focus enters.** On open, `useFocusTrap` queries every focusable
 *   descendant of the dialog surface (in DOM order) and focuses the first
 *   one. Because MSDS's `Dialog` renders its own "Fechar" `IconButton` in
 *   the header *before* this component's `children`, that close button is
 *   what receives focus first — a real change from the old md-dialog version
 *   (which had no close button of its own and autofocused the content area),
 *   verified live and in the updated test below, not assumed.
 * - **Tab is trapped.** The same hook's `keydown` listener on the surface
 *   wraps Tab/Shift+Tab between the first and last focusable descendant.
 * - **Escape closes.** A second `keydown` listener, scoped to `props.open`,
 *   calls `onClose` on `Escape` — same behavior as before, different
 *   mechanism (a document listener instead of the native `<dialog>` cancel
 *   event).
 * - **Focus returns.** `useFocusTrap`'s effect captures
 *   `document.activeElement` when it runs (dialog opens) and restores it in
 *   its cleanup (dialog closes) — this component owned that restoration
 *   itself before; MSDS's `Dialog` now does, so the local `useEffect` this
 *   file used to have for it is gone, not reimplemented redundantly.
 *
 * Two props this app's call sites use that MSDS's `Dialog` does not have:
 * - **`description`**: MSDS's `Dialog` has a single `children` slot (no
 *   separate headline/description split beyond `title`). Folded into
 *   `children` here, as the same `<p>` this file always rendered for it,
 *   ahead of the caller's own content — no behavior change for a caller.
 * - **`className`**: MSDS's `Dialog` does not accept one (no `...rest`
 *   spread) and no call site in this app passes one today (confirmed by
 *   grep before this conversion) — kept in the prop type for signature
 *   stability, intentionally not forwarded, the same treatment Button.tsx
 *   gives an unused `ref`.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  className: _className,
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
  return (
    <MsdsDialog open={open} onClose={onClose} title={title} footer={footer}>
      {description ? (
        <>
          <p className="mb-2 text-sm text-ink-muted">{description}</p>
          {children}
        </>
      ) : (
        children
      )}
    </MsdsDialog>
  );
}
