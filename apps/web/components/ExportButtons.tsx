import { ptBR } from "@/lib/i18n";
import { opensInBrowser, type ExportFormat } from "@/lib/api";
import { MenuButton, MenuItem } from "@/components/ui";
import { IconDownload } from "@/components/ui/icons";

const t = ptBR.exports;

const LABELS: Record<ExportFormat, string> = {
  csv: t.csv,
  xlsx: t.xlsx,
  docx: t.docx,
  html: t.html,
};

interface ExportButtonsProps {
  /** Builds the download URL for a given format. */
  urlFor: (format: ExportFormat) => string;
  label?: string;
  hint?: string;
}

/**
 * CSV / XLSX / DOCX / HTML exports, behind one "Exportar ▾" button (D-91).
 *
 * Four outlined buttons in a row competed with the one action each screen is
 * for ("+ Novo material", "Executar"); a menu costs one button's width and
 * still names every format once opened.
 *
 * Each entry is a plain anchor rather than a fetch call: the browser then
 * honours the `Content-Disposition` filename the API sends and shows its own
 * save dialog, which is both simpler and better behaved than reconstructing a
 * blob.
 *
 * HTML is the odd one out and deliberately so — it is served inline, so it
 * opens in a new tab instead of downloading. That tab is what the user prints
 * to PDF, which is how the report reaches a monograph without the project
 * taking on a PDF-generation dependency.
 */
export function ExportButtons({ urlFor, label = t.title, hint }: ExportButtonsProps) {
  const formats: ExportFormat[] = ["csv", "xlsx", "docx", "html"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MenuButton label={label} icon={<IconDownload className="h-4 w-4" />}>
        {formats.map((format) => {
          const inBrowser = opensInBrowser(format);
          return (
            <MenuItem
              key={format}
              href={urlFor(format)}
              {...(inBrowser
                ? { target: "_blank", rel: "noopener noreferrer", title: t.htmlTitle, hint: t.htmlHint }
                : { download: true })}
            >
              {LABELS[format]}
            </MenuItem>
          );
        })}
      </MenuButton>
      {hint && <span className="text-support text-ink-subtle">{hint}</span>}
    </div>
  );
}
