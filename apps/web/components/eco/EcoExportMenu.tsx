"use client";

import { useMutation } from "@tanstack/react-query";
import { downloadEcoAudit, type ExportFormat } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { downloadBlob } from "@/lib/rasterize";
import { ecoExportText } from "@/lib/i18n-eco-export";
import type { EcoAuditRequest } from "@/lib/types";
import { Alert, MenuButton, MenuItem } from "@/components/ui";
import { IconDownload } from "@/components/ui/icons";

const t = ptBR.exports;
const text = ecoExportText;

const FORMATS: { format: ExportFormat; label: string; hint: string }[] = [
  { format: "csv", label: t.csv, hint: text.csvHint },
  { format: "xlsx", label: t.xlsx, hint: text.xlsxHint },
  { format: "docx", label: t.docx, hint: text.docxHint },
  { format: "pptx", label: t.pptx, hint: text.pptxHint },
  { format: "html", label: t.html, hint: text.htmlHint },
];

/**
 * The Eco Audit's "Exportar ▾" (D-91, D-172): one menu button, never a row of
 * buttons, and never a primary — "Executar" is the screen's one action.
 *
 * It exports the brief the shown result was computed from, not what the inputs
 * say now: editing a field after running must not produce a file that disagrees
 * with the screen. The server re-runs that brief, so the figures are the ones
 * the screen shows. With no result yet the button is disabled and says why.
 *
 * Loading: the trigger is disabled and relabelled while the file is made, so a
 * second click cannot start a second request. Error: the server's own sentence,
 * in an alert beside the button, and the menu stays usable to try again.
 */
export function EcoExportMenu({
  brief,
  download = downloadEcoAudit,
  saveFile = downloadBlob,
}: {
  /** The brief the displayed result was computed from; `null` before any run. */
  brief: EcoAuditRequest | null;
  /** Injected in tests; the real one fetches the file. */
  download?: typeof downloadEcoAudit;
  saveFile?: (blob: Blob, filename: string) => void;
}) {
  const file = useMutation({
    mutationFn: (format: ExportFormat) => {
      if (brief === null) throw new Error(text.idle);
      return download(brief, format);
    },
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
  });

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {file.isError ? (
        <Alert tone="danger" role="alert" title={text.errorTitle}>
          {file.error.message}
        </Alert>
      ) : null}
      {file.isSuccess ? (
        <span role="status" className="text-support text-ink-subtle">
          {text.saved(file.data.filename)}
        </span>
      ) : null}
      {brief === null ? (
        <span className="text-support text-ink-subtle">{text.idle}</span>
      ) : null}
      <MenuButton
        label={file.isPending ? text.running : t.title}
        icon={<IconDownload className="h-4 w-4" />}
        disabled={brief === null || file.isPending}
      >
        {FORMATS.map(({ format, label, hint }) => (
          <MenuItem key={format} hint={hint} onSelect={() => file.mutate(format)}>
            {label}
          </MenuItem>
        ))}
      </MenuButton>
    </div>
  );
}
