"use client";

import { useEffect, useId, useRef, useState, type ElementType, type ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { ChartToolbar } from "./ChartToolbar";
import { IconChartColumns, IconTable } from "@/components/ui/icons";
import "./figures.css";

const t = ptBR.chart;

/**
 * The MSDS chart card (D-80): `.msds-chart-card` chrome, a toolbar with the
 * title on the left and the figure's own controls on the right, and the
 * "Gráfico | Tabela" switch (D-91) that swaps the figure for the table it was
 * drawn from.
 *
 * Every figure in the application goes through here, so the three promises a
 * figure makes are kept in one place instead of in each chart:
 *
 * - **D-31.** The table is not optional. It is rendered even while the figure
 *   is showing (only `hidden`), so the switch's `aria-controls` always points at
 *   something and the table is never re-derived on a click.
 * - **Export.** `ChartToolbar` receives the element that wraps the figure, and
 *   `lib/figureExport.ts` finds either a Plotly graph or an `svg[data-chart-figure]`
 *   in it. The figure stays mounted while the table shows, so exporting from the
 *   table view still exports the figure — and a legend the reader switched off
 *   stays off in the file.
 * - **One heading per figure,** at the level the page needs (`headingLevel`), so
 *   the document outline matches what the eye sees.
 */
/** One way to draw the figure — a seat of the chart-type switch (D-94). */
export interface ChartView {
  key: string;
  /** The button's name, e.g. "Barras horizontais". */
  label: string;
  icon: ReactNode;
}

export function ChartFrame({
  views,
  view,
  onViewChange,
  figureIcon,
  eyebrow,
  meta,
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
  /**
   * D-94: the ways this figure can be drawn (bars ↔ columns…). Each becomes a
   * round icon button in the corner, beside the table. Without it the corner
   * offers one "Gráfico" button — the figure as it is — and the table.
   */
  views?: ChartView[];
  view?: string;
  onViewChange?: (key: string) => void;
  /** The icon of the lone "Gráfico" button, when there are no `views`. */
  figureIcon?: ReactNode;
  /** What kind of figure this is. Announced before the title; not drawn (D-91). */
  eyebrow?: ReactNode;
  /** A mono aside at the right of the heading, e.g. the index guide's expression. */
  meta?: ReactNode;
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
          {/* D-91: the small-caps eyebrow is the page header's alone. The
              figure's kind stays in the heading for assistive technology, so
              it is still announced as "Mapa de Ashby, Módulo de Young ×
              Densidade" — only the visual label is gone. */}
          <Heading id={headingId} className="msds-chart-title">
            {eyebrow ? (
              <span className="sr-only">
                {eyebrow}
                {", "}
              </span>
            ) : null}
            {title}
          </Heading>
          {description ? (
            <p className="mt-1 max-w-prose text-support text-ink-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {meta ? <span className="mr-1 font-mono text-xs text-ink-subtle">{meta}</span> : null}
          {controls}
          {hasFigure && (table || (views && views.length > 1)) ? (
            // D-94: the AI Studio corner — round icon buttons, one per way to
            // draw the figure, then the table (D-31). Each has its name as
            // `aria-label` and as the native title, since the glyph is all
            // that shows.
            <div role="group" aria-label={t.view} className="chart-iconbar">
              {(views && views.length > 0
                ? views
                : [{ key: "figure", label: t.showFigure, icon: figureIcon ?? <IconChartColumns /> }]
              ).map((option) => {
                const pressed = !showTable && (!views || option.key === view);
                return (
                  <button
                    key={option.key}
                    type="button"
                    className="chart-icon-btn"
                    aria-label={option.label}
                    title={option.label}
                    aria-pressed={pressed}
                    onClick={() => {
                      if (views) onViewChange?.(option.key);
                      if (showTable) {
                        toggled.current = true;
                        setShowTable(false);
                      }
                    }}
                  >
                    {option.icon}
                  </button>
                );
              })}
              {table ? (
                <button
                  type="button"
                  className="chart-icon-btn"
                  aria-label={t.showTable}
                  title={t.showTable}
                  aria-pressed={showTable}
                  aria-controls={tableId}
                  onClick={() => {
                    if (showTable) return;
                    toggled.current = true;
                    setShowTable(true);
                  }}
                >
                  <IconTable />
                </button>
              ) : null}
            </div>
          ) : null}
          <ChartToolbar
            target={figure}
            fileName={exportName}
            disabled={exportDisabled || !hasFigure}
          />
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
