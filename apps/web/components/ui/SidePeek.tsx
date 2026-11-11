"use client";

import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ptBR } from "@/lib/i18n";
import { ButtonLink, IconButton } from "./Button";
import { useFocusTrap } from "./focusTrap";
import { IconClose } from "./icons";

const t = ptBR.ds;

/**
 * D-206: open a record beside the list — Notion's side peek, M3's modal side
 * sheet. It generalises what `MaterialPreview` does for the catalogue (D-184)
 * to anything with a page of its own: a process, a study, a glossary entry, a
 * notebook.
 *
 * Modal on purpose. A non-modal panel that floats over a list leaves the
 * reader two scroll regions and no clear way back; the sheet traps focus,
 * closes on Escape or the scrim, and gives focus back to whatever opened it
 * (`useFocusTrap`). At 600 px and below it covers the screen, as M3's side
 * sheet does on a compact window; above, it is 28 rem wide from the right.
 *
 * `openHref` is the way out to the full page, the same "Abrir ficha completa"
 * as the preview; the peek never holds anything the page does not.
 */
export function SidePeek({
  open,
  title,
  onClose,
  openHref,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  openHref?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const headingId = useId();
  useFocusTrap(open, panel, onClose);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div aria-hidden className="m3-sheet-scrim" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="ds-side-peek"
      >
        <div className="flex items-start gap-2 border-b border-line-divider px-4 py-3">
          <h2 id={headingId} className="min-w-0 flex-1 truncate text-heading text-ink">
            {title}
          </h2>
          {openHref ? (
            <ButtonLink href={openHref} variant="tonal" size="sm">
              {t.sidePeekOpen}
            </ButtonLink>
          ) : null}
          <IconButton label={t.close} onClick={onClose} icon={<IconClose className="h-4 w-4" />} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </>,
    document.body,
  );
}
