"use client";

import { useState, type ReactNode } from "react";
import type { BoxDomain } from "@/lib/types";
import type { ClassSymbol } from "@/lib/design/palette";
import { formatNumber } from "@/lib/format";
import { MarkerSymbol } from "./ChartLegend";
import { ChartTooltip, type TooltipContent } from "./ChartTooltip";
import { linearTicks, logTicks, makeScale, truncate, useChartWidth, useRovingFocus } from "./figureKit";

export interface BoxRow {
  key: string;
  label: string;
  color: string;
  symbol: ClassSymbol;
  count: number;
  minimum: number;
  q1: number;
  median: number;
  q3: number;
  maximum: number;
}

const ROW = 38;
const BOX = 16;
const TRACK = 22;

/**
 * MSDS `BoxPlot`: one row per class, whisker from minimum to maximum, a box
 * from Q1 to Q3 in the class colour and a median bar in ink (D-80).
 *
 * The five numbers of every box arrive computed (`app/calculations/statistics.py`,
 * ADR 0004) — this component places them on an axis and never derives a
 * quantile, and the padded axis extent arrives computed too (`domains`). On a
 * log scale the axis is base-10; the caller only offers log when the backend
 * says the property allows it (`allows_log_scale`), and a figure whose backend
 * withheld the log extent (a non-positive number) falls back to linear rather
 * than dropping a class in silence.
 */
export function BoxPlotChart({
  figureLabel,
  rows,
  scale,
  domains,
  axisTitle,
  describe,
}: {
  figureLabel: string;
  rows: BoxRow[];
  scale: "linear" | "log";
  /** Axis extents computed by the backend (`DistributionOut.domain`). */
  domains: BoxDomain | null | undefined;
  axisTitle: string;
  describe: (row: BoxRow) => { aria: string; info?: ReactNode; tip?: TooltipContent };
}) {
  const [measure, width] = useChartWidth();
  const [active, setActive] = useState<{ key: string; focus: boolean } | null>(null);
  const roving = useRovingFocus(rows.length);

  // The padded extent arrives from the server (ADR 0004): the component picks
  // the log one when asked and offered, and falls back to linear when the
  // backend withheld it (a non-positive minimum) rather than dropping a class.
  const log = scale === "log" && Boolean(domains?.log);
  const domain: [number, number] = (log ? domains?.log : domains?.linear) ?? [0, 1];

  const W = width ?? 0;
  const labelWidth = Math.min(150, Math.max(80, W * 0.24));
  const plotX = labelWidth + 14;
  const plotWidth = Math.max(40, W - plotX - 12);
  const top = 6;
  const axisY = top + rows.length * ROW + 4;
  const height = axisY + 46;
  const x = makeScale(domain, [plotX, plotX + plotWidth], log);
  const ticks = log ? logTicks(domain[0], domain[1]) : linearTicks(domain[0], domain[1], plotWidth < 300 ? 3 : 5);
  const labelChars = Math.floor((labelWidth - 16) / 6.6);
  const activeRow = active ? rows.find((row) => row.key === active.key) : undefined;

  return (
    <div ref={measure} className="relative min-w-0">
      {width !== null ? (
        <svg
          data-chart-figure
          role="figure"
          aria-label={figureLabel}
          className="chart-svg"
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          onKeyDown={roving.onKeyDown}
        >
          <g aria-hidden>
            {ticks.map((tick) => (
              <g key={tick}>
                <line className="chart-grid" x1={x(tick)} x2={x(tick)} y1={top} y2={axisY} />
                <text className="chart-tick" x={x(tick)} y={axisY + 16} textAnchor="middle">
                  {formatNumber(tick)}
                </text>
              </g>
            ))}
            <line className="chart-axis" x1={plotX} x2={plotX + plotWidth} y1={axisY} y2={axisY} />
            <text className="chart-axis-title" x={plotX + plotWidth / 2} y={axisY + 38} textAnchor="middle">
              {axisTitle}
            </text>
          </g>

          {rows.map((row, index) => {
            const cy = top + index * ROW + ROW / 2;
            const isActive = active?.key === row.key;
            const boxStart = x(row.q1);
            // A class with one material has Q1 = Q3: still a visible mark.
            const boxWidth = Math.max(3, x(row.q3) - boxStart);
            const words = describe(row);
            return (
              <g
                key={row.key}
                ref={roving.register(index)}
                className="chart-mark chart-box-row chart-fade-in"
                data-active={isActive ? "true" : "false"}
                style={{ animationDelay: `${index * 60}ms` }}
                role="img"
                aria-label={words.aria}
                tabIndex={roving.tabIndexFor(index)}
                onMouseEnter={() => setActive({ key: row.key, focus: false })}
                onMouseLeave={() => setActive(null)}
                onFocus={() => {
                  roving.setActive(index);
                  setActive({ key: row.key, focus: true });
                }}
                onBlur={() => setActive(null)}
              >
                {/* The whole row answers the pointer, not only the thin box. */}
                <rect x={0} y={cy - ROW / 2} width={W} height={ROW} style={{ fill: "transparent" }} />
                {/* The class's shape just left of its name: the greyscale-safe
                    half of the class encoding (D-28). Text width is estimated —
                    a layout guess, never a value. */}
                <MarkerSymbol
                  symbol={row.symbol}
                  x={Math.max(6, labelWidth - Math.min(row.label.length, labelChars) * 6.4 - 10)}
                  y={cy}
                  r={4.5}
                  color={row.color}
                />
                <text
                  className="chart-label"
                  data-active={isActive ? "true" : "false"}
                  x={labelWidth}
                  y={cy}
                  dominantBaseline="central"
                  textAnchor="end"
                >
                  {truncate(row.label, labelChars)}
                </text>
                <line
                  x1={x(row.minimum)}
                  x2={x(row.maximum)}
                  y1={cy}
                  y2={cy}
                  style={{ stroke: "rgb(var(--ink-subtle))", strokeWidth: 1 }}
                />
                {[row.minimum, row.maximum].map((end, i) => (
                  <line
                    key={i}
                    x1={x(end)}
                    x2={x(end)}
                    y1={cy - 5}
                    y2={cy + 5}
                    style={{ stroke: "rgb(var(--ink-subtle))", strokeWidth: 1 }}
                  />
                ))}
                <rect
                  className="chart-box"
                  x={boxStart}
                  y={cy - BOX / 2}
                  width={boxWidth}
                  height={BOX}
                  rx={4}
                  style={{ fill: row.color }}
                />
                <line
                  x1={x(row.median)}
                  x2={x(row.median)}
                  y1={cy - TRACK / 2}
                  y2={cy + TRACK / 2}
                  style={{ stroke: "rgb(var(--ink))", strokeWidth: 2 }}
                />
                {isActive ? (
                  <rect
                    className="chart-focus-ring"
                    x={boxStart - 2}
                    y={cy - BOX / 2 - 2}
                    width={boxWidth + 4}
                    height={BOX + 4}
                    rx={5}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height: top + rows.length * ROW + 50 }} />
      )}
      {/* D-95: the five numbers of the box under the pointer or focus. */}
      <ChartTooltip content={activeRow ? (describe(activeRow).tip ?? describe(activeRow).info ?? null) : null} />
    </div>
  );
}
