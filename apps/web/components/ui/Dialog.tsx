"use client";

import { useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { IconClose } from "./icons";
import { IconButton } from "./Button";
import { useFocusTrap } from "./focusTrap";

/**
 * Modal dialog.
 *
 * Written by hand rather than on top of `<dialog>` because jsdom does not
 * implement `showModal`, and a dialog that cannot be tested is a dialog whose
 * focus trap quietly rots. The trap itself lives in `focusTrap.ts`, shared with
 * the navigation drawer.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-surface-inverted/50 backdrop-blur-[1px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[90vh] w-full flex-col rounded-t-card border border-edge bg-surface-raised shadow-overlay sm:max-w-lg sm:rounded-card",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-edge-subtle px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-xs text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            size="sm"
            label={ptBR.ui.close}
            icon={<IconClose />}
            onClick={onClose}
          />
        </div>
        <div className="scroll-x overflow-y-auto p-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle bg-surface-sunken px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
