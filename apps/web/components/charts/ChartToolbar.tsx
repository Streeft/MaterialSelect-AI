"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { ptBR } from "@/lib/i18n";
import { downloadChartImage } from "@/lib/charts";
import { RasterizeError } from "@/lib/rasterize";
import { MenuButton, MenuItem } from "@/components/ui/Menu";
import { IconDownload } from "@/components/ui/icons";

const t = ptBR.chart;

/**
 * The controls that belong to a figure rather than to the page.
 *
 * Every chart in the application offers the same two exports, and each screen
 * used to spell them out again with its own button class and its own error
 * handling — which is how the map ended up saying "Exportando…" while the
 * comparator said nothing at all. One toolbar, one behaviour, one place to fix
 * it. The failure is reported next to the button that caused it, not swallowed:
 * a download that silently does nothing is indistinguishable from a broken app.
 */
export function ChartToolbar({
  target,
  fileName,
  disabled = false,
  extraItems,
  report = false,
  className,
}: {
  /** The element wrapping the rendered figure. */
  target: RefObject<HTMLElement | null>;
  /** Base name of the downloaded file, without extension. */
  fileName: string;
  disabled?: boolean;
  /**
   * Further entries of the same menu — the figure's data as a file (D-106) —
   * after the two images, so there is still one "Exportar" per figure (D-91).
   */
  extraItems?: ReactNode;
  /**
   * D-213: also offer the figure "para relatório" — a fixed 3:2 layout, the
   * card's description under the title, PNG at 3× (see `REPORT_FIGURE`).
   */
  report?: boolean;
  className?: string;
}) {
  const [exporting, setExporting] = useState<"png" | "svg" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: "png" | "svg", forReport = false) {
    setError(null);
    setExporting(format);
    try {
      await downloadChartImage(
        target.current,
        format,
        forReport ? `${fileName}-relatorio` : fileName,
        { report: forReport },
      );
    } catch (caught) {
      // A PNG the browser would not rasterise still exists as SVG: say so.
      setError(caught instanceof RasterizeError ? t.exportPngFailed : t.exportError);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className={className}>
      {/* D-91: one "Exportar" menu instead of two text links; D-95: as a
          round icon button in the figure's corner, the AI Studio way. */}
      <div role="group" aria-label={t.toolbar} className="flex items-center">
        <MenuButton
          iconOnly
          label={exporting ? t.exporting : t.exportMenu}
          icon={<IconDownload />}
          disabled={disabled || exporting !== null}
        >
          <MenuItem hint={t.exportPngHint} onSelect={() => void handleExport("png")}>
            {t.exportPng}
          </MenuItem>
          <MenuItem hint={t.exportSvgHint} onSelect={() => void handleExport("svg")}>
            {t.exportSvg}
          </MenuItem>
          {report ? (
            <>
              <MenuItem hint={t.exportReportPngHint} onSelect={() => void handleExport("png", true)}>
                {t.exportReportPng}
              </MenuItem>
              <MenuItem hint={t.exportReportSvgHint} onSelect={() => void handleExport("svg", true)}>
                {t.exportReportSvg}
              </MenuItem>
            </>
          ) : null}
          {extraItems}
        </MenuButton>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-caption text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
