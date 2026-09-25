"use client";

import { useState, type RefObject } from "react";
import { ptBR } from "@/lib/i18n";
import { downloadChartImage } from "@/lib/charts";
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
  className,
}: {
  /** The element wrapping the rendered figure. */
  target: RefObject<HTMLElement | null>;
  /** Base name of the downloaded file, without extension. */
  fileName: string;
  disabled?: boolean;
  className?: string;
}) {
  const [exporting, setExporting] = useState<"png" | "svg" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: "png" | "svg") {
    setError(null);
    setExporting(format);
    try {
      await downloadChartImage(target.current, format, fileName);
    } catch {
      setError(t.exportError);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className={className}>
      {/* D-91: one "Exportar ▾" instead of two text links. The toolbar row
          keeps a single verb for the file and a single switch for the view,
          so it no longer crowds the title on a half-width card. */}
      <div role="group" aria-label={t.toolbar} className="flex items-center">
        <MenuButton
          label={exporting ? t.exporting : t.exportMenu}
          icon={<IconDownload className="h-4 w-4" />}
          disabled={disabled || exporting !== null}
        >
          <MenuItem hint={t.exportPngHint} onSelect={() => void handleExport("png")}>
            {t.exportPng}
          </MenuItem>
          <MenuItem hint={t.exportSvgHint} onSelect={() => void handleExport("svg")}>
            {t.exportSvg}
          </MenuItem>
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
