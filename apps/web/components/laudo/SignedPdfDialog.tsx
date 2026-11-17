"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSignedPdfs,
  signedPdfUrl,
  uploadSignedPdf,
  type IssuedLaudo,
  type SignedPdf,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { laudoText as t } from "@/lib/i18n-laudo";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Dialog,
  ErrorState,
  Skeleton,
  FileDrop,
  UploadList,
  type UploadItem,
} from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import { formatSentAt } from "./DeliveryList";

/** The server's limit (`SIGNED_PDF_MAX_BYTES`); the check here only spares a wasted upload. */
export const SIGNED_PDF_MAX_MB = 10;

/** The first bytes of a file, as text: a PDF starts with `%PDF-` whatever it is called. */
function readHead(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      resolve(String.fromCharCode(...bytes));
    };
    reader.readAsArrayBuffer(file.slice(0, 5));
  });
}

/** Why this file would be refused, in words, or `null` when it may go. */
export async function refusalFor(file: File): Promise<string | null> {
  if (file.size > SIGNED_PDF_MAX_MB * 1024 * 1024) return t.tooBig(file.name, SIGNED_PDF_MAX_MB);
  if ((await readHead(file)) !== "%PDF-") return t.notPdf(file.name);
  return null;
}

/**
 * The PDF the engineer signed, attached to one issued version (D-243). Dragging or choosing a
 * file sends it with a real progress bar; the server checks the bytes and the size too. The file
 * sits beside the version and never inside it (the frozen document and its code do not move),
 * and sending another one **replaces** the current without deleting the old: every upload stays
 * in the history, downloadable.
 */
export function SignedPdfDialog({
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
  const [item, setItem] = useState<UploadItem | null>(null);

  const uploads = useQuery({
    queryKey: ["laudo-signed-pdfs", issued.id],
    queryFn: () => listSignedPdfs(issued.id),
    enabled: open,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      setItem({ key, name: file.name, progress: 0, status: "sending" });
      const refusal = await refusalFor(file);
      if (refusal) throw new Error(refusal);
      return uploadSignedPdf(issued.id, file, (progress) =>
        setItem((current) => (current ? { ...current, progress } : current)),
      );
    },
    onSuccess: (saved) => {
      setItem((current) => (current ? { ...current, progress: 1, status: "done" } : current));
      notify({ message: t.uploadedToast(saved.filename) });
      void queryClient.invalidateQueries({ queryKey: ["laudo-signed-pdfs", issued.id] });
      void queryClient.invalidateQueries({ queryKey: ["laudo-versions"] });
      void queryClient.invalidateQueries({ queryKey: ["laudo-email-preview"] });
    },
    onError: (error) =>
      setItem((current) =>
        current
          ? {
              ...current,
              status: "failed",
              progress: null,
              // Our own refusals are sentences already; the server's go through describeApiError.
              error: error instanceof Error && !("status" in error) ? error.message : describeApiError(error),
            }
          : current,
      ),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.signedTitle(issued.version)}
      description={t.signedDescription}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t.done}
        </Button>
      }
    >
      <div className="dialog-wide flex flex-col gap-4">
        <FileDrop
          title={t.dropTitle}
          hint={t.dropHint}
          buttonLabel={t.dropButton}
          accept="application/pdf,.pdf"
          multiple={false}
          disabled={upload.isPending}
          onFiles={(files) => {
            const file = files[0];
            if (file) upload.mutate(file);
          }}
        />
        <UploadList
          label={t.uploadList}
          items={item ? [item] : []}
          statusLabels={t.uploadStatus}
        />
        {upload.isError ? (
          <span className="sr-only" role="alert">
            {t.uploadErrorTitle}
          </span>
        ) : null}

        <section aria-labelledby={`laudo-pdfs-${issued.id}`} className="flex flex-col gap-2">
          <h3 id={`laudo-pdfs-${issued.id}`} className="text-body font-semibold text-ink">
            {t.signedHistoryTitle}
          </h3>
          {uploads.isPending ? (
            <div role="status">
              <span className="sr-only">{t.deliveriesLoading}</span>
              <Skeleton className="h-10 w-full" />
            </div>
          ) : uploads.isError ? (
            <ErrorState
              title={t.signedHistoryError}
              error={uploads.error}
              onRetry={() => uploads.refetch()}
            />
          ) : uploads.data.length === 0 ? (
            <Alert tone="info">{t.signedHistoryEmpty}</Alert>
          ) : (
            <ul aria-label={t.signedHistoryTable} className="flex flex-col gap-2">
              {uploads.data.map((pdf) => (
                <PdfItem key={pdf.id} issuedId={issued.id} pdf={pdf} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}

function PdfItem({ issuedId, pdf }: { issuedId: number; pdf: SignedPdf }) {
  return (
    <li className="rounded-card border border-edge-subtle p-2 text-caption">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge tone={pdf.current ? "success" : "neutral"}>
            {pdf.current ? t.signedCurrent : t.signedReplaced}
          </Badge>
          <span className="min-w-0 break-words font-medium text-ink">{pdf.filename}</span>
        </span>
        <ButtonLink
          size="sm"
          href={signedPdfUrl(issuedId, pdf.id)}
          download
          aria-label={t.downloadLabel(pdf.filename)}
        >
          {t.download}
        </ButtonLink>
      </div>
      <p className="mt-1 text-ink-muted">
        {formatSentAt(pdf.uploaded_at)} · {t.sizeKb(pdf.size_bytes)}
        {pdf.uploaded_by ? ` · ${t.signedBy(pdf.uploaded_by)}` : ""}
      </p>
      <p className="mt-1 break-all font-mono text-2xs text-ink-muted">
        {t.sha256} {pdf.sha256}
      </p>
    </li>
  );
}
