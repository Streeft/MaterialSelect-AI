"use client";

import { useMemo, useState } from "react";
import type { SweepResult, SweepSkippedStep, SweepStep } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { paletteSeats } from "@/lib/design/palette";
import { Alert, EmptyState } from "@/components/ui";
import { IconChartScatter } from "@/components/ui/icons";
import { ChartFrame } from "./ChartFrame";
import { ChartTooltip, type TooltipContent } from "./ChartTooltip";
import { FigureData } from "./FigureData";
import { linearTicks, logTicks, makeScale, tok, useChartWidth } from "./figureKit";

const t = ptBR.synthesis.sweep.chart;

/** One row of the source table: a grid position that has an index, or one that does not. */
interface SweepRow {
  position: number;
  parameter: number;
  step: SweepStep | null;
  skipped: SweepSkippedStep | null;
}

/** The index of a step as text: a scalar, or the Reuss–Voigt pair — never a mean. */
function indexText(step: SweepStep): string | null {
  if (step.index_value !== null) return formatNumber(step.index_value);
  if (step.index_min !== null && step.index_max !== null) {
    return `${formatNumber(step.index_min)} – ${formatNumber(step.index_max)}`;
  }
  return null;
}

/** Consecutive grid positions, so a skipped step breaks the line instead of being bridged. */
function runsOf<T extends { position: number }>(items: T[]): T[][] {
  const runs: T[][] = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1]!.position === item.position - 1) last.push(item);
    else runs.push([item]);
  }
  return runs;
}

/**
 * One index against the swept variable (D-144).
 *
 * Draws only what the API sent: the grid, the index per step and, for a
 * composite whose index reads the modulus, the Reuss–Voigt pair as a band
 * between its two limits (never a mean). A step without an index is not drawn
 * as zero and is not bridged: the line breaks there, and the table and the
 * list below the figure say why (D-31, D-24). Nothing is computed here beyond
 * mapping data to pixels.
 */
export function SweepChart({ data, headingLevel = 3 }: { data: SweepResult; headingLevel?: 2 | 3 | 4 }) {
  const [measure, width] = useChartWidth();
  const seat = useMemo(() => paletteSeats()[0]!, []);
  const [tip, setTip] = useState<TooltipContent | null>(null);

  const indexName = data.index.name ?? data.index.expression;
  const xLog = data.spacing === "log";

  const scalar = useMemo(() => data.steps.filter((s) => s.index_value !== null), [data.steps]);
  const paired = useMemo(
    () => data.steps.filter((s) => s.index_min !== null && s.index_max !== null),
    [data.steps],
  );
  const hasFigure = scalar.length + paired.length > 0;

  const rows = useMemo<SweepRow[]>(() => {
    const all: SweepRow[] = [
      ...data.steps.map((step) => ({
        position: step.position,
        parameter: step.parameter,
        step,
        skipped: null,
      })),
      ...data.skipped.map((skipped) => ({
        position: skipped.position,
        parameter: skipped.parameter,
        step: null,
        skipped,
      })),
    ];
    return all.sort((a, b) => a.position - b.position);
  }, [data.steps, data.skipped]);

  const { domainX, domainY } = useMemo(() => {
    const xs = data.grid.length > 0 ? data.grid : data.steps.map((s) => s.parameter);
    const ys: number[] = [];
    for (const s of data.steps) {
      if (s.index_value !== null) ys.push(s.index_value);
      if (s.index_min !== null) ys.push(s.index_min);
      if (s.index_max !== null) ys.push(s.index_max);
    }
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = hi > lo ? (hi - lo) * 0.08 : Math.abs(hi) * 0.1 || 1;
    return {
      domainX: [Math.min(...xs), Math.max(...xs)] as [number, number],
      domainY: [lo - pad, hi + pad] as [number, number],
    };
  }, [data.grid, data.steps]);

  const W = width ?? 640;
  const H = 340;
  const margin = { top: 20, right: 28, bottom: 52, left: 76 };
  const plotWidth = Math.max(40, W - margin.left - margin.right);
  const plotHeight = Math.max(40, H - margin.top - margin.bottom);
  const plotRight = margin.left + plotWidth;
  const plotBottom = margin.top + plotHeight;
  const xScale = makeScale(domainX, [margin.left, plotRight], xLog);
  const yScale = makeScale(domainY, [plotBottom, margin.top]);
  const xTicks = xLog ? logTicks(domainX[0], domainX[1]) : linearTicks(domainX[0], domainX[1]);
  const yTicks = linearTicks(domainY[0], domainY[1]);

  const point = (x: number, y: number) => `${xScale(x).toFixed(1)},${yScale(y).toFixed(1)}`;

  const show = (step: SweepStep) =>
    setTip({
      title: t.pointLabel(step.position + 1),
      rows: [
        { key: "x", label: data.variable_label, value: formatNumber(step.parameter) },
        { key: "y", label: indexName, value: indexText(step) ?? "" },
      ],
    });

  const table = (
    <FigureData<SweepRow>
      caption={t.tableCaption(indexName)}
      rows={rows}
      rowKey={(row) => row.position}
      rowHeader={{ header: t.columnStep, cell: (row) => String(row.position + 1) }}
      columns={[
        {
          key: "parameter",
          header: data.variable_label,
          numeric: true,
          cell: (row) => formatNumber(row.parameter),
        },
        {
          key: "index",
          header: t.yAxis(indexName, data.index.dimension),
          numeric: true,
          // A step without an index is absence, written out by FigureData (D-24).
          cell: (row) => (row.step ? indexText(row.step) : null),
        },
        {
          key: "status",
          header: t.columnStatus,
          cell: (row) =>
            row.step ? t.calculated(row.step.quality) : t.withoutIndex(row.skipped?.reason ?? ""),
        },
      ]}
    />
  );

  return (
    <ChartFrame
      figureIcon={<IconChartScatter />}
      eyebrow={t.figure}
      title={t.title(indexName)}
      description={data.note}
      headingLevel={headingLevel}
      exportName={chartFileName("varredura", data.variable)}
      exportDisabled={!hasFigure}
      empty={
        hasFigure ? undefined : (
          <EmptyState title={ptBR.synthesis.sweep.emptyTitle} description={ptBR.synthesis.sweep.emptyHint} />
        )
      }
      table={table}
      footer={
        <div className="flex flex-col gap-3">
          {paired.length > 0 ? (
            <p className="flex items-center gap-2 text-support text-ink-muted">
              <svg width={18} height={10} aria-hidden>
                <rect width={18} height={10} rx={2} fill={tok("--ink-muted", 0.18)} />
              </svg>
              {t.band}
            </p>
          ) : null}
          {data.skipped.length > 0 ? (
            <Alert tone="warning" title={t.skippedTitle}>
              <p className="mb-1 text-support">{t.skippedHint}</p>
              <ul className="list-disc pl-5">
                {data.skipped.map((item) => (
                  <li key={item.position}>
                    <strong>
                      {t.pointLabel(item.position + 1)} ({data.variable_label}: {formatNumber(item.parameter)})
                    </strong>
                    : {item.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {data.absent.length > 0 ? (
            <div className="well flex flex-col gap-1 text-support text-ink-muted">
              <span className="font-medium text-ink">{t.absentTitle}</span>
              <ul className="list-disc pl-5">
                {data.absent.map((item) => (
                  <li key={item.slug}>
                    <span className="font-medium text-ink">{item.name}</span>: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      }
    >
      {(
        <div ref={measure} className="relative min-w-0">
          <svg
            data-chart-figure
            role="figure"
            aria-label={ptBR.synthesis.sweep.chart.figureLabel(indexName, data.variable_label)}
            className="chart-svg select-none"
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
          >
            <g aria-hidden>
              {xTicks.map((tick) => (
                <g key={`x-${tick}`}>
                  <line className="chart-grid" x1={xScale(tick)} x2={xScale(tick)} y1={margin.top} y2={plotBottom} />
                  <text className="chart-tick" x={xScale(tick)} y={plotBottom + 16} textAnchor="middle">
                    {formatNumber(tick)}
                  </text>
                </g>
              ))}
              {yTicks.map((tick) => (
                <g key={`y-${tick}`}>
                  <line className="chart-grid" x1={margin.left} x2={plotRight} y1={yScale(tick)} y2={yScale(tick)} />
                  <text className="chart-tick" x={margin.left - 8} y={yScale(tick) + 4} textAnchor="end">
                    {formatNumber(tick)}
                  </text>
                </g>
              ))}
              <line className="chart-axis" x1={margin.left} x2={plotRight} y1={plotBottom} y2={plotBottom} />
              <line className="chart-axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={plotBottom} />
              <text className="chart-axis-title" x={margin.left + plotWidth / 2} y={plotBottom + 40} textAnchor="middle">
                {data.variable_label}
              </text>
              <text
                className="chart-axis-title"
                x={-(margin.top + plotHeight / 2)}
                y={16}
                textAnchor="middle"
                transform="rotate(-90)"
              >
                {t.yAxis(indexName, data.index.dimension)}
              </text>
              {/* Bands first, under the lines. A run is a stretch of consecutive
                  steps: a skipped step breaks it. */}
              {runsOf(paired).map((run) => (
                <polygon
                  key={`band-${run[0]!.position}`}
                  data-sweep-band
                  points={[
                    ...run.map((s) => point(s.parameter, s.index_max!)),
                    ...[...run].reverse().map((s) => point(s.parameter, s.index_min!)),
                  ].join(" ")}
                  fill={seat.color}
                  fillOpacity={0.16}
                  stroke={seat.color}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
              ))}
              {runsOf(scalar).map((run) => (
                <polyline
                  key={`line-${run[0]!.position}`}
                  data-sweep-line
                  points={run.map((s) => point(s.parameter, s.index_value!)).join(" ")}
                  fill="none"
                  stroke={seat.color}
                  strokeWidth={2}
                />
              ))}
            </g>
            {data.steps.map((step) => {
              const ys = [step.index_value, step.index_min, step.index_max].filter(
                (v): v is number => v !== null,
              );
              return ys.map((y, i) => (
                <circle
                  key={`${step.position}-${i}`}
                  data-sweep-point
                  cx={xScale(step.parameter)}
                  cy={yScale(y)}
                  r={4}
                  fill={seat.color}
                  stroke={tok("--surface")}
                  strokeWidth={1.5}
                  onMouseEnter={() => show(step)}
                  onMouseLeave={() => setTip(null)}
                />
              ));
            })}
          </svg>
          <ChartTooltip content={tip} />
        </div>
      )}
    </ChartFrame>
  );
}
