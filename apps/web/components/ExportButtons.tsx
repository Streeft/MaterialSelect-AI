import { ptBR } from "@/lib/i18n";
import type { ExportFormat } from "@/lib/api";

const t = ptBR.exports;

interface ExportButtonsProps {
  /** Builds the download URL for a given format. */
  urlFor: (format: ExportFormat) => string;
  label?: string;
  hint?: string;
}

/**
 * CSV / XLSX download links.
 *
 * Plain anchors rather than fetch calls: the browser then honours the
 * `Content-Disposition` filename the API sends and shows its own save dialog,
 * which is both simpler and better behaved than reconstructing a blob.
 */
export function ExportButtons({ urlFor, label = t.title, hint }: ExportButtonsProps) {
  const formats: ExportFormat[] = ["csv", "xlsx"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      {formats.map((format) => (
        <a
          key={format}
          href={urlFor(format)}
          download
          className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          {format === "csv" ? t.csv : t.xlsx}
        </a>
      ))}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}
