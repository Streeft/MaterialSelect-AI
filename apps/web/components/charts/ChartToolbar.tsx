"use client";

import { useState, type RefObject } from "react";
import { ptBR } from "@/lib/i18n";
import { downloadPlotImage } from "@/lib/charts";
import { Button } from "@/components/ui";

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
      await downloadPlotImage(target.current, format, fileName);
    } catch {
      setError(t.exportError);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className={className}>
      <div role="group" aria-label={t.toolbar} className="flex items-center gap-2">
        {(["png", "svg"] as const).map((format) => (
          <Button
            key={format}
            size="sm"
            variant="secondary"
            disabled={disabled || exporting !== null}
            onClick={() => void handleExport(format)}
          >
            {exporting === format ? t.exporting : format === "png" ? t.exportPng : t.exportSvg}
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-2xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
