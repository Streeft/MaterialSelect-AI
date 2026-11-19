"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mergeSource } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import type { SourceRecord } from "@/lib/types";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import { Alert, Button, ConfirmDialog, Dialog, Select } from "@/components/ui";

const t = curadoriaText.sourcesAdmin;

/**
 * "Mesclar em…" (D-249): choose the source that keeps the citations, then confirm in a dialog of
 * its own (a modal does not open inside another one, so the two are siblings). What moves and what
 * stays is said in words before the confirmation, including the one thing a merge can change
 * without anyone noticing: the licence the moved data now carry. A demonstration source has no
 * "Mesclar" at all, and one flagged as possibly third-party content only lists flagged targets,
 * the same two refusals the server makes (`POST /api/sources/{id}/mesclar`).
 */
export function MergeSourceDialog({
  source,
  sources,
  onClose,
}: {
  source: SourceRecord | null;
  sources: SourceRecord[];
  onClose: () => void;
}) {
  const client = useQueryClient();
  const snackbar = useOptionalSnackbar();
  const [targetId, setTargetId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const targets = source
    ? sources.filter(
        (s) =>
          s.id !== source.id &&
          !s.is_demo &&
          (!source.contains_third_party_data || s.contains_third_party_data),
      )
    : [];
  const target = targets.find((s) => String(s.id) === targetId) ?? null;
  const differs =
    source !== null &&
    target !== null &&
    (source.license_label ?? "") !== (target.license_label ?? "");

  const close = () => {
    setTargetId("");
    setConfirming(false);
    merge.reset();
    onClose();
  };

  const merge = useMutation({
    mutationFn: () => mergeSource(source!.id, target!.id),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["sources"] });
      void client.invalidateQueries({ queryKey: ["material"] });
      snackbar?.notify({ message: t.merged(source!.label, result.target.label, result.moved) });
      close();
    },
    // The refusal is shown in the first dialog, where the choice can be changed.
    onError: () => setConfirming(false),
  });

  return (
    <>
      <Dialog
        open={source !== null && !confirming}
        onClose={close}
        title={source ? t.mergeTitle(source.label) : t.mergeAction}
        description={t.mergeHint}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {ptBR.actions.cancel}
            </Button>
            <Button variant="primary" disabled={target === null} onClick={() => setConfirming(true)}>
              {t.mergeContinue}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {source?.contains_third_party_data ? (
            <Alert tone="warning">{t.mergeFlagged}</Alert>
          ) : null}
          {targets.length === 0 ? (
            <p className="text-body text-ink-muted">{t.mergeNoTargets}</p>
          ) : (
            <Select
              label={t.mergeTarget}
              value={targetId}
              onChange={(event) => {
                merge.reset();
                setTargetId(event.target.value);
              }}
            >
              <option value="">{t.mergePick}</option>
              {targets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
          {differs && source && target ? (
            <Alert tone="info">
              {t.mergeLicenseDiffers(
                source.license_label ?? t.noLicense,
                target.license_label ?? t.noLicense,
              )}
            </Alert>
          ) : null}
          {merge.isError ? (
            <Alert tone="danger" role="alert" title={t.mergeFailed}>
              {describeApiError(merge.error)}
            </Alert>
          ) : null}
        </div>
      </Dialog>
      <ConfirmDialog
        open={source !== null && confirming && target !== null}
        title={t.mergeConfirmTitle}
        message={
          source && target
            ? t.mergeConfirmMessage(source.label, target.label, source.citations ?? null)
            : undefined
        }
        confirmLabel={t.mergeConfirm}
        pending={merge.isPending}
        onConfirm={() => merge.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
