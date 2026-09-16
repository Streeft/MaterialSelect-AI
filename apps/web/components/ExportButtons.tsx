import { ptBR } from "@/lib/i18n";
import { opensInBrowser, type ExportFormat } from "@/lib/api";
import { ButtonLink } from "@/components/ui";

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
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </span>
      {formats.map((format) => {
        const inBrowser = opensInBrowser(format);
        return (
          <ButtonLink
            key={format}
            href={urlFor(format)}
            size="sm"
            {...(inBrowser
              ? { target: "_blank", rel: "noopener noreferrer", title: t.htmlTitle }
              : { download: true })}
          >
            {LABELS[format]}
          </ButtonLink>
        );
      })}
      {hint && <span className="text-xs text-ink-subtle">{hint}</span>}
    </div>
  );
}
