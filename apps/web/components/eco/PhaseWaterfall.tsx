"use client";

import { useMemo, useState } from "react";
import type { EcoWaterfall, EcoWaterfallStep } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ChartTooltip, tipValue } from "@/components/charts/ChartTooltip";
import { FigureData, type FigureColumn } from "@/components/charts/FigureData";
import {
  linearTicks,
  makeScale,
  tok,
  truncate,
  useChartWidth,
  useRovingFocus,
} from "@/components/charts/figureKit";

const t = ecoPhaseI18n.waterfall;

const HEIGHT = 300;
const MARGIN = { top: 20, right: 16, bottom: 44, left: 64 };
const BAR_FILL = 0.62;

interface Column {
  step: EcoWaterfallStep;
  isTotal: boolean;
}

/**
 * Contribution by life-cycle phase as a waterfall (the SimaPro / OpenLCA chart,
 * D-216).
 *
 * **Every number is the server's.** Where each step starts and ends, the total
 * and the extent of the value axis arrive in data coordinates
 * (`EcoWaterfall`, ADR 0004); this component only maps them to pixels, which is
 * the one piece of arithmetic a figure may do on the client. It never adds a
 * phase to the running total itself.
 *
 * A phase the audit could not compute has `value: null` and a written `reason`.
 * It is drawn as a dashed marker at the level before it — present on the axis
 * so the reader sees the gap, and not a zero-height bar that would read as
 * "this phase costs nothing" (principle 3). A credit (negative value) steps
 * downwards and is coloured as a credit, never netted away.
 */
export function PhaseWaterfall({
  waterfall,
  title,
  exportName,
}: {
  waterfall: EcoWaterfall;
  title: string;
  exportName: string;
}) {
  const [measure, width] = useChartWidth();
  const [active, setActive] = useState<number | null>(null);

  const columns = useMemo<Column[]>(
    () => [
      ...waterfall.steps.map((step) => ({ step, isTotal: false })),
      { step: waterfall.total, isTotal: true },
    ],
    [waterfall],
  );
  const roving = useRovingFocus(columns.length);

  const quantityName = waterfall.quantity === "energy" ? t.quantityEnergy : t.quantityCarbon;
  const W = width ?? 640;
  const plotLeft = MARGIN.left;
  const plotRight = Math.max(plotLeft + 60, W - MARGIN.right);
  const plotTop = MARGIN.top;
  const plotBottom = HEIGHT - MARGIN.bottom;
  const band = (plotRight - plotLeft) / columns.length;
  const barWidth = Math.max(14, band * BAR_FILL);
  const y = makeScale(waterfall.domain, [plotBottom, plotTop]);
  const ticks = useMemo(
    () => linearTicks(waterfall.domain[0], waterfall.domain[1], 5),
    [waterfall.domain],
  );

  const rows = columns;
  const tableColumns: FigureColumn<Column>[] = [
    {
      key: "contribution",
      header: `${t.columnContribution} (${waterfall.unit})`,
      numeric: true,
      cell: ({ step }) => (step.value === null ? null : formatNumber(step.value)),
    },
    {
      key: "running",
      header: `${t.columnRunning} (${waterfall.unit})`,
      numeric: true,
      cell: ({ step, isTotal }) =>
        isTotal ? null : step.end === null || step.value === null ? null : formatNumber(step.end),
    },
    {
      key: "reason",
      header: t.columnReason,
      cell: ({ step }) => (step.value === null ? (step.reason ?? t.absent) : null),
    },
  ];

  const tooltip = (() => {
    if (active === null) return null;
    const column = columns[active];
    if (!column) return null;
    const { step } = column;
    if (step.value === null) {
      return { title: step.label, rows: [], note: step.reason ?? t.absent };
    }
    return {
      title: step.label,
      rows: [
        {
          key: "value",
          label: t.tipContribution,
          value: tipValue(step.value, waterfall.unit),
          color: tok(step.value < 0 ? "--success" : column.isTotal ? "--ink" : "--brand-600"),
          symbol: "square" as const,
        },
        ...(column.isTotal || step.end === null
          ? []
          : [{ key: "running", label: t.tipRunning, value: tipValue(step.end, waterfall.unit) }]),
      ],
    };
  })();

  return (
    <ChartFrame
      title={title}
      description={t.description}
      headingLevel={4}
      exportName={exportName}
      table={
        <FigureData<Column>
          caption={title}
          rows={rows}
          rowKey={({ step }) => step.phase}
          rowHeader={{ header: t.columnPhase, cell: ({ step }) => step.label }}
          columns={tableColumns}
        />
      }
    >
      <div ref={measure} className="relative min-w-0">
        <svg
          data-chart-figure
          role="figure"
          aria-label={t.figureLabel(quantityName)}
          className="chart-svg select-none"
          width={W}
          height={HEIGHT}
          viewBox={`0 0 ${W} ${HEIGHT}`}
          onKeyDown={roving.onKeyDown}
        >
          <g aria-hidden>
            {ticks.map((tick) => (
              <g key={`tick-${tick}`}>
                <line className="chart-grid" x1={plotLeft} x2={plotRight} y1={y(tick)} y2={y(tick)} />
                <text className="chart-tick" x={plotLeft - 8} y={y(tick) + 4} textAnchor="end">
                  {formatNumber(tick)}
                </text>
              </g>
            ))}
            <line
              className="chart-axis"
              x1={plotLeft}
              x2={plotRight}
              y1={y(0)}
              y2={y(0)}
            />
            <text
              className="chart-axis-title"
              x={-(plotTop + (plotBottom - plotTop) / 2)}
              y={14}
              textAnchor="middle"
              transform="rotate(-90)"
            >
              {waterfall.unit}
            </text>
          </g>

          {columns.map((column, index) => {
            const { step, isTotal } = column;
            const cx = plotLeft + band * index + band / 2;
            const left = cx - barWidth / 2;
            const label = truncate(step.label, Math.max(6, Math.floor(band / 6)));
            const next = columns[index + 1];

            if (step.value === null) {
              const level = isTotal ? y(0) : y(step.end ?? 0);
              return (
                <g
                  key={step.phase}
                  ref={roving.register(index)}
                  className="chart-mark"
                  role="img"
                  tabIndex={roving.tabIndexFor(index)}
                  aria-label={t.absentAria(step.label, step.reason ?? t.absent)}
                  onFocus={() => {
                    roving.setActive(index);
                    setActive(index);
                  }}
                  onBlur={() => setActive(null)}
                  onMouseEnter={() => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                >
                  <rect
                    x={left}
                    y={level - 14}
                    width={barWidth}
                    height={28}
                    rx={3}
                    fill="none"
                    stroke={tok("--quality-ausente")}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <text
                    className="chart-tick"
                    x={cx}
                    y={level + 4}
                    textAnchor="middle"
                    fill={tok("--quality-ausente")}
                  >
                    {t.absent}
                  </text>
                  <text className="chart-label" x={cx} y={plotBottom + 18} textAnchor="middle">
                    {label}
                  </text>
                </g>
              );
            }

            const start = isTotal ? 0 : (step.start ?? 0);
            const end = isTotal ? step.value : (step.end ?? step.value);
            const top = Math.min(y(start), y(end));
            const height = Math.max(2, Math.abs(y(start) - y(end)));
            const fill = isTotal ? tok("--ink-muted") : step.value < 0 ? tok("--success") : tok("--brand-600");
            const runningText = formatNumber(isTotal ? step.value : end);
            return (
              <g
                key={step.phase}
                ref={roving.register(index)}
                className="chart-mark"
                role="img"
                tabIndex={roving.tabIndexFor(index)}
                aria-label={
                  isTotal
                    ? `${step.label}: ${formatNumber(step.value)} ${waterfall.unit}`
                    : t.stepAria(
                        step.label,
                        `${formatNumber(step.value)} ${waterfall.unit}${step.value < 0 ? ` (${t.credit})` : ""}`,
                        `${runningText} ${waterfall.unit}`,
                      )
                }
                onFocus={() => {
                  roving.setActive(index);
                  setActive(index);
                }}
                onBlur={() => setActive(null)}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
              >
                <rect x={left} y={top} width={barWidth} height={height} rx={3} fill={fill} />
                {next && !next.isTotal ? (
                  <line
                    x1={left + barWidth}
                    x2={left + band}
                    y1={y(end)}
                    y2={y(end)}
                    stroke={tok("--edge-strong")}
                    strokeDasharray="3 3"
                    aria-hidden
                  />
                ) : null}
                <text
                  className="chart-tick"
                  x={cx}
                  y={top - 5}
                  textAnchor="middle"
                  aria-hidden
                >
                  {formatNumber(step.value)}
                </text>
                <text className="chart-label" x={cx} y={plotBottom + 18} textAnchor="middle" aria-hidden>
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
        <ChartTooltip content={tooltip} />
      </div>
    </ChartFrame>
  );
}
