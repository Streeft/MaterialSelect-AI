import { ptBR } from "@/lib/i18n";
import { opensInBrowser, type ExportFormat } from "@/lib/api";

const t = ptBR.exports;

const LABELS: Record<ExportFormat, string> = {
  csv: t.csv,
  xlsx: t.xlsx,
  html: t.html,
};

interface ExportButtonsProps {
  /** Builds the download URL for a given format. */
  urlFor: (format: ExportFormat) => string;
  label?: string;
  hint?: string;
}

/**
 * CSV / XLSX / HTML export links.
 *
 * Plain anchors rather than fetch calls: the browser then honours the
 * `Content-Disposition` filename the API sends and shows its own save dialog,
 * which is both simpler and better behaved than reconstructing a blob.
 *
 * HTML is the odd one out and deliberately so — it is served inline, so it
 * opens in a new tab instead of downloading. That tab is what the user prints
 * to PDF, which is how the report reaches a monograph without the project
 * taking on a PDF-generation dependency.
 */
export function ExportButtons({ urlFor, label = t.title, hint }: ExportButtonsProps) {
  const formats: ExportFormat[] = ["csv", "xlsx", "html"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      {formats.map((format) => {
        const inBrowser = opensInBrowser(format);
        return (
          <a
            key={format}
            href={urlFor(format)}
            {...(inBrowser
              ? { target: "_blank", rel: "noopener noreferrer", title: t.htmlTitle }
              : { download: true })}
            className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            {LABELS[format]}
          </a>
        );
      })}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}
