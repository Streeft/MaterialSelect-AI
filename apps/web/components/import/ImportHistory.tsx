"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listImports, rollbackImport } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { describeApiError } from "@/lib/errors";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  TableSkeleton,
  RowHeader,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
  type BadgeTone,
} from "@/components/ui";

/**
 * Status tones, by what the state means for the catalogue rather than by
 * temperature: only `IMPORTADO` changed the data, and only `REVERTIDO` says
 * something was undone. The written label is what carries the state — the tone
 * only sorts the list at a glance.
 */
const STATUS_TONES: Record<string, BadgeTone> = {
  PENDENTE: "neutral",
  VALIDADO: "info",
  IMPORTADO: "success",
  CANCELADO: "neutral",
  REVERTIDO: "warning",
};

/** Past import jobs with status and a rollback action for committed ones. */
export function ImportHistory() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["imports"],
    queryFn: listImports,
  });

  // D-201: the job awaiting confirmation, if any (MSDS dialog, not window.confirm).
  const [confirmingJob, setConfirmingJob] = useState<number | null>(null);

  const rollback = useMutation({
    mutationFn: (jobId: number) => rollbackImport(jobId),
    // The rollback's own failure is said next to the button, in words (D-200).
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["chart"] });
    },
  });

  if (isLoading) return <TableSkeleton rows={3} columns={5} label={ptBR.importer.historyLoading} />;
  if (isError) {
    return (
      <ErrorState title={ptBR.importer.historyError} error={error} onRetry={() => void refetch()} />
    );
  }
  if (!data || data.length === 0) {
    return <EmptyState title={ptBR.importer.historyEmpty} />;
  }

  return (
    <>
      <ConfirmDialog
        open={confirmingJob !== null}
        title={ptBR.importer.rollback}
        message={ptBR.importer.rollbackConfirm}
        confirmLabel={ptBR.importer.rollback}
        onCancel={() => setConfirmingJob(null)}
        onConfirm={() => {
          if (confirmingJob !== null) rollback.mutate(confirmingJob);
          setConfirmingJob(null);
        }}
      />
      {rollback.isError && <Alert tone="danger" role="alert">{describeApiError(rollback.error)}</Alert>}
      <TableScroll label={ptBR.importer.historyTitle}>
        <Table>
          <TableCaption>{ptBR.importer.historyTitle}</TableCaption>
          <THead>
            <Tr>
              <Th>{ptBR.importer.columnFile}</Th>
              <Th>{ptBR.importer.columnDate}</Th>
              <Th>{ptBR.importer.columnStatus}</Th>
              <Th numeric>{ptBR.importer.columnCounts}</Th>
              <Th numeric>{ptBR.importer.columnImported}</Th>
              <Th>
                <span className="sr-only">{ptBR.actions.columnActions}</span>
              </Th>
            </Tr>
          </THead>
          <TBody>
            {data.map((job) => (
              <Tr key={job.id}>
                <RowHeader>
                  {job.filename}
                  {job.sheet_name ? (
                    <span className="ml-1 text-2xs text-ink-subtle">
                      ({job.sheet_name})
                    </span>
                  ) : null}
                </RowHeader>
                <Td className="whitespace-nowrap text-ink-muted">
                  {new Date(job.created_at).toLocaleString("pt-BR")}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONES[job.status] ?? "neutral"}>
                    {ptBR.importer.status[job.status]}
                  </Badge>
                </Td>
                <Td numeric className="text-ink-muted">
                  {job.valid_count} / {job.error_count} / {job.duplicate_count}
                </Td>
                <Td numeric className="text-ink-muted">
                  {job.imported_count}
                </Td>
                <Td className="text-right">
                  {job.status === "IMPORTADO" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={rollback.isPending}
                      onClick={() => setConfirmingJob(job.id)}
                      aria-label={`${ptBR.importer.rollback}: ${job.filename}`}
                    >
                      {ptBR.importer.rollback}
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableScroll>
    </>
  );
}
