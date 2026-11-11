"use client";

import { ptBR } from "@/lib/i18n";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/**
 * Confirmation for a destructive action, on the MSDS dialog (D-201).
 *
 * Replaces `window.confirm`, which is unstyled, ignores the theme and cannot be
 * tested. Cancel is the dialog's default way out (button, Escape, backdrop);
 * confirming is always an explicit click on the one primary button.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  pending = false,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {ptBR.actions.cancel}
          </Button>
          <Button variant="primary" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  );
}
