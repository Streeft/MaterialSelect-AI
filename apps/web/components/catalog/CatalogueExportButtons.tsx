"use client";

import { useMutation } from "@tanstack/react-query";
import { catalogueExportUrl, downloadCatalogueFile, type ExportFormat } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import { catalogueExportText as text } from "@/lib/i18n-catalogue-export";
import { downloadBlob } from "@/lib/rasterize";
import { Alert } from "@/components/ui";
import { ExportButtons } from "@/components/ExportButtons";

/**
 * The catalogue's "Exportar ▾" (D-249). Everything but the CSV is still the browser's own download
 * of an address. The CSV is fetched, because the server streams it and a stream that breaks half
 * way has already sent its 200: the only sign is the line `# ERRO:` at the end of the file. This
 * reads that line back and, when it is there, says so on the screen beside the button instead of
 * leaving a cut file to pass for the catalogue. The file is saved either way (the reader may want
 * to look), and the alert says not to trust it.
 */
export function CatalogueExportButtons({
  download = downloadCatalogueFile,
  saveFile = downloadBlob,
}: {
  /** Injected in tests; the real one fetches the file. */
  download?: typeof downloadCatalogueFile;
  saveFile?: (blob: Blob, filename: string) => void;
}) {
  const file = useMutation({
    mutationFn: (format: ExportFormat) => download(format),
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
  });

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {file.isError ? (
        <Alert tone="danger" role="alert" title={text.errorTitle}>
          {describeApiError(file.error)}
        </Alert>
      ) : null}
      {file.isSuccess && file.data.truncated ? (
        <Alert tone="warning" role="alert" title={text.truncatedTitle}>
          {text.truncated(file.data.filename)}
        </Alert>
      ) : null}
      {file.isSuccess && !file.data.truncated ? (
        <span role="status" className="text-support text-ink-subtle">
          {text.saved(file.data.filename)}
        </span>
      ) : null}
      <ExportButtons
        urlFor={catalogueExportUrl}
        label={ptBR.exports.catalogue}
        onSelect={{ csv: () => file.mutate("csv") }}
        busy={file.isPending}
        busyLabel={text.running}
      />
    </div>
  );
}
