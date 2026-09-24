"use client";

import { useEffect, useId, useRef, useState, type ElementType, type ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { ChartToolbar } from "./ChartToolbar";
import "./figures.css";

const t = ptBR.chart;

/**
 * The MSDS chart card (D-80): `.msds-chart-card` chrome, a toolbar with the
 * title on the left and the figure's own controls on the right, and the
 * "Ver tabela de dados" toggle that swaps the figure for the table it was
 * drawn from.
 *
 * Every figure in the application goes through here, so the three promises a
 * figure makes are kept in one place instead of in each chart:
 *
 * - **D-31.** The table is not optional. It is rendered even while the figure
 *   is showing (only `hidden`), so the toggle's `aria-controls` always points at
 *   something and the table is never re-derived on a click.
 * - **Export.** `ChartToolbar` receives the element that wraps the figure, and
 *   `lib/figureExport.ts` finds either a Plotly graph or an `svg[data-chart-figure]`
 *   in it. The figure stays mounted while the table shows, so exporting from the
 *   table view still exports the figure — and a legend the reader switched off
 *   stays off in the file.
 * - **One heading per figure,** at the level the page needs (`headingLevel`), so
 *   the document outline matches what the eye sees.
 */
export function ChartFrame({
  title,
  description,
  headingLevel = 2,
  controls,
  exportName,
  exportDisabled = false,
  table,
  notice,
  empty,
  footer,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  /** The figure's own controls (scale, cursor mode) — placed before the exports. */
  controls?: ReactNode;
  /** Base name of the exported file, from `chartFileName`. */
  exportName: string;
  exportDisabled?: boolean;
  /** The figure's data table (a `FigureData`). */
  table?: ReactNode;
  /** Above the figure: a picker, a warning. Shown in both views. */
  notice?: ReactNode;
  /** When there is nothing to draw: the written reason, in place of the figure. */
  empty?: ReactNode;
  /** Below the figure: notes about what it omits. Shown in both views. */
  footer?: ReactNode;
  className?: string;
  /** The figure: its `<svg data-chart-figure>` (or Plotly), legend and hover line. */
  children?: ReactNode;
}) {
  const figure = useRef<HTMLDivElement>(null);
  const [showTable, setShowTable] = useState(false);
  const toggled = useRef(false);
  const id = useId();
  const headingId = `${id}-title`;
  const tableId = `${id}-table`;
  const Heading = `h${headingLevel}` as ElementType;
  const hasFigure = !empty;

  // Plotly measures its container on window resize only. A map that was hidden
  // behind the table comes back at whatever size the window has now, so tell it
  // to look again. Skipped on mount: nothing was hidden yet.
  useEffect(() => {
    if (!toggled.current) return;
    if (!showTable) window.dispatchEvent(new Event("resize"));
  }, [showTable]);

  return (
    <div className={cn("msds-chart-card min-w-0", className)} aria-labelledby={headingId} role="group">
      <div className="msds-chart-toolbar">
        {/* A basis, not just `flex-1`: on a half-width card the actions wrap
            under the title instead of squeezing it into a two-word column. */}
        <div className="min-w-0 flex-[1_1_18rem]">
          <Heading id={headingId} className="msds-chart-title">
            {title}
          </Heading>
          {description ? (
            <p className="mt-1 max-w-prose text-xs text-ink-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {controls}
          <ChartToolbar
            target={figure}
            fileName={exportName}
            disabled={exportDisabled || !hasFigure}
          />
          {hasFigure && table ? (
            <button
              type="button"
              className="msds-table-toggle"
              aria-controls={tableId}
              aria-expanded={showTable}
              onClick={() => {
                toggled.current = true;
                setShowTable((open) => !open);
              }}
            >
              {showTable ? t.showFigure : t.showTable}
            </button>
          ) : null}
        </div>
      </div>

      {notice}

      {empty ?? (
        <>
          <div ref={figure} hidden={showTable} className="relative min-w-0">
            {children}
          </div>
          {table ? (
            <div id={tableId} hidden={!showTable} className="min-w-0">
              {table}
            </div>
          ) : null}
        </>
      )}

      {footer}
    </div>
  );
}
