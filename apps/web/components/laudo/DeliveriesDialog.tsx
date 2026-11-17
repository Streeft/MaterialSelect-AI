"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revokeLaudoDelivery, type IssuedLaudo, type LaudoDelivery } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { laudoText as t } from "@/lib/i18n-laudo";
import { Alert, Button, ConfirmDialog, Dialog } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import { DeliveryHistory } from "./DeliveryList";

/**
 * Every send of one issued version with the life of its link (D-243): until when it opens, whether
 * it was revoked, how many times it was opened, and "Revogar link" behind a confirmation. Reading
 * and revoking are the owner's; nothing here is computed on the screen. The confirmation is a
 * sibling of this dialog, not a child: a modal does not open inside another modal.
 */
export function DeliveriesDialog({
  issued,
  open,
  onClose,
}: {
  issued: IssuedLaudo;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();
  const [revoking, setRevoking] = useState<LaudoDelivery | null>(null);
  const revoke = useMutation({
    mutationFn: (delivery: LaudoDelivery) => revokeLaudoDelivery(delivery.id),
    onSuccess: () => {
      setRevoking(null);
      notify({ message: t.revokedToast });
      void queryClient.invalidateQueries({ queryKey: ["laudo-deliveries", issued.id] });
    },
    onError: () => setRevoking(null),
  });
  return (
    <>
      <Dialog
        open={open && revoking === null}
        onClose={onClose}
        title={t.deliveriesTitle(issued.version)}
        description={t.deliveriesDescription}
        footer={
          <Button variant="ghost" onClick={onClose}>
            {t.done}
          </Button>
        }
      >
        <div className="dialog-wide flex flex-col gap-3">
          {revoke.isError ? (
            <Alert tone="danger" role="alert" title={t.revokeErrorTitle}>
              {describeApiError(revoke.error)}
            </Alert>
          ) : null}
          <DeliveryHistory
            issued={issued}
            onRevoke={(delivery) => {
              revoke.reset();
              setRevoking(delivery);
            }}
          />
        </div>
      </Dialog>
      <ConfirmDialog
        open={open && revoking !== null}
        title={t.revokeTitle}
        message={t.revokeMessage}
        confirmLabel={t.revokeConfirm}
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
        onCancel={() => setRevoking(null)}
      />
    </>
  );
}
