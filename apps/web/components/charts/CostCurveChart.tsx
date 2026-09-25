"use client";

import { useMemo, useState } from "react";
import type { CostResult } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { paletteSeats } from "@/lib/design/palette";
import { ChartFrame } from "./ChartFrame";
import { ChartInfoLine, ChartLegend, type LegendItem, MarkerSymbol } from "./ChartLegend";
import { FigureData } from "./FigureData";
import { logTicks, makeScale, useChartWidth, useRovingFocus } from "./figureKit";

const t = {
  chartTitle: "Curva Custo × Lote",
  chartSubtitle:
    "Variação do custo unitário C(n) com o tamanho do lote de produção n (escala log-log). O lote atual está destacado.",
  chartAxisBatch: "Tamanho do lote (peças)",
  chartAxisCost: "Custo unitário estimado (unidade monetária)",
  chartCurrentBatch: (n: number) => `Lote atual (${formatNumber(n)} un)`,
  chartFigureLabel: "Curva Custo versus Tamanho do Lote",
  chartTableBatch: "Lote (n)",
  empty: "Nenhum processo compatível com curva calculada.",
};

interface CostCurveChartProps {
  result: CostResult;
  title?: string;
  description?: string;
}

export function CostCurveChart({
  result,
  title = t.chartTitle,
  description = t.chartSubtitle,
}: CostCurveChartProps) {
  const [measure, width] = useChartWidth();
  const seats = useMemo(() => paletteSeats(), []);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [activeMark, setActiveMark] = useState<{
    processId: number;
    processName: string;
    batchSize: number;
    cost: number;
  } | null>(null);

  const costed = useMemo(() => {
    return (result.costed ?? []).filter((p) => (p.curve?.length ?? 0) > 0);
  }, [result.costed]);

  const visibleProcesses = useMemo(() => {
    return costed.filter((p) => !hidden.has(String(p.process_id)));
  }, [costed, hidden]);

  const roving = useRovingFocus(visibleProcesses.length);

  // Compute log-log domain over all visible curve points and the current batch size
  const { domainX, domainY, allBatchSizes } = useMemo(() => {
    let minX = result.batch_size > 0 ? result.batch_size : 1;
    let maxX = result.batch_size > 0 ? result.batch_size : 1;
    let minY = Infinity;
    let maxY = -Infinity;
    const batchSet = new Set<number>();
    if (result.batch_size > 0) batchSet.add(result.batch_size);

    for (const p of costed) {
      for (const pt of p.curve ?? []) {
        if (pt.batch_size > 0 && Number.isFinite(pt.batch_size)) {
          minX = Math.min(minX, pt.batch_size);
          maxX = Math.max(maxX, pt.batch_size);
          batchSet.add(pt.batch_size);
        }
        if (pt.cost > 0 && Number.isFinite(pt.cost)) {
          minY = Math.min(minY, pt.cost);
          maxY = Math.max(maxY, pt.cost);
        }
      }
    }

    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || minY <= 0) {
      minY = 1;
      maxY = 1000;
    }

    // A little logarithmic air on y so extreme points don't clip the borders
    const logMinY = Math.log10(minY);
    const logMaxY = Math.log10(maxY);
    const padY = Math.max((logMaxY - logMinY) * 0.08, 0.05);

    const sortedBatches = Array.from(batchSet).sort((a, b) => a - b);

    return {
      domainX: [minX, maxX] as [number, number],
      domainY: [10 ** (logMinY - padY), 10 ** (logMaxY + padY)] as [number, number],
      allBatchSizes: sortedBatches,
    };
  }, [costed, result.batch_size]);

  // Legend items
  const legendItems: LegendItem[] = useMemo(() => {
    return costed.map((p, i) => {
      const seat = seats[i % seats.length]!;
      return {
        key: String(p.process_id),
        label: p.process_name,
        color: seat.color,
        symbol: seat.symbol,
        dash: seat.dash,
      };
    });
  }, [costed, seats]);

  const handleToggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // SVG Geometry
  const W = width ?? 640;
  const H = 340;
  const margin = { top: 28, right: 28, bottom: 52, left: 68 };
  const plotWidth = Math.max(40, W - margin.left - margin.right);
  const plotHeight = Math.max(40, H - margin.top - margin.bottom);
  const plotRight = margin.left + plotWidth;
  const plotBottom = margin.top + plotHeight;

  const xScale = makeScale(domainX, [margin.left, plotRight], true);
  const yScale = makeScale(domainY, [plotBottom, margin.top], true);

  const xTicks = useMemo(() => logTicks(domainX[0], domainX[1]), [domainX]);
  const yTicks = useMemo(() => logTicks(domainY[0], domainY[1]), [domainY]);

  // Highlight current batch
  const currentBatchX = xScale(result.batch_size);
  const isCurrentBatchVisible =
    result.batch_size >= domainX[0] && result.batch_size <= domainX[1];

  // Table rows for FigureData (D-31)
  const tableRows = useMemo(() => {
    return allBatchSizes.map((bSize) => {
      const costsByProcess: Record<number, number> = {};
      for (const p of costed) {
        const pt = p.curve?.find((c) => Math.abs(c.batch_size - bSize) < 1e-5);
        if (pt) {
          costsByProcess[p.process_id] = pt.cost;
        }
      }
      return {
        batch_size: bSize,
        costs: costsByProcess,
      };
    });
  }, [allBatchSizes, costed]);

  const tableComponent = (
    <FigureData
      caption={t.chartFigureLabel}
      rows={tableRows}
      rowKey={(row) => row.batch_size}
      rowHeader={{
        header: t.chartTableBatch,
        cell: (row) =>
          row.batch_size === result.batch_size
            ? `${formatNumber(row.batch_size)} (${t.chartCurrentBatch(row.batch_size)})`
            : formatNumber(row.batch_size),
      }}
      columns={visibleProcesses.map((p) => ({
        key: String(p.process_id),
        header: p.process_name,
        numeric: true,
        cell: (row) => {
          const val = row.costs[p.process_id];
          return val !== undefined ? formatNumber(val) : null;
        },
      }))}
    />
  );

  if (costed.length === 0) {
    return null;
  }

  return (
    <ChartFrame
      title={title}
      description={description}
      headingLevel={3}
      exportName="curva-custo-lote"
      table={tableComponent}
      footer={
        <ChartLegend
          items={legendItems}
          hidden={hidden}
          onToggle={handleToggle}
          onHover={setHoveredKey}
        />
      }
    >
      <div ref={measure} className="min-w-0">
        <svg
          data-chart-figure
          role="figure"
          aria-label={t.chartFigureLabel}
          className="chart-svg select-none"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          onKeyDown={roving.onKeyDown}
        >
          {/* Gridlines & Ticks */}
          <g aria-hidden>
            {/* X grid & ticks */}
            {xTicks.map((tick) => {
              const xPos = xScale(tick);
              return (
                <g key={`xtick-${tick}`}>
                  <line
                    className="chart-grid"
                    x1={xPos}
                    x2={xPos}
                    y1={margin.top}
                    y2={plotBottom}
                  />
                  <text
                    className="chart-tick"
                    x={xPos}
                    y={plotBottom + 16}
                    textAnchor="middle"
                  >
                    {formatNumber(tick)}
                  </text>
                </g>
              );
            })}

            {/* Y grid & ticks */}
            {yTicks.map((tick) => {
              const yPos = yScale(tick);
              return (
                <g key={`ytick-${tick}`}>
                  <line
                    className="chart-grid"
                    x1={margin.left}
                    x2={plotRight}
                    y1={yPos}
                    y2={yPos}
                  />
                  <text
                    className="chart-tick"
                    x={margin.left - 8}
                    y={yPos + 4}
                    textAnchor="end"
                  >
                    {formatNumber(tick)}
                  </text>
                </g>
              );
            })}

            {/* Axes rules */}
            <line
              className="chart-axis"
              x1={margin.left}
              x2={plotRight}
              y1={plotBottom}
              y2={plotBottom}
            />
            <line
              className="chart-axis"
              x1={margin.left}
              x2={margin.left}
              y1={margin.top}
              y2={plotBottom}
            />

            {/* Axis titles */}
            <text
              className="chart-axis-title"
              x={margin.left + plotWidth / 2}
              y={plotBottom + 40}
              textAnchor="middle"
            >
              {t.chartAxisBatch}
            </text>
            <text
              className="chart-axis-title"
              x={-(margin.top + plotHeight / 2)}
              y={18}
              textAnchor="middle"
              transform="rotate(-90)"
            >
              {t.chartAxisCost}
            </text>

            {/* Current batch indicator line */}
            {isCurrentBatchVisible && (
              <g>
                <line
                  x1={currentBatchX}
                  x2={currentBatchX}
                  y1={margin.top}
                  y2={plotBottom}
                  stroke="rgb(var(--ink-subtle))"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <text
                  x={currentBatchX}
                  y={margin.top - 8}
                  textAnchor="middle"
                  className="chart-label"
                  style={{ fontSize: 11, fontWeight: 500 }}
                >
                  {t.chartCurrentBatch(result.batch_size)}
                </text>
              </g>
            )}
          </g>

          {/* Curves & Marks */}
          {visibleProcesses.map((p, pIndex) => {
            const originalIndex = costed.findIndex((c) => c.process_id === p.process_id);
            const seat = seats[originalIndex % seats.length]!;
            const curve = p.curve ?? [];
            const isHovered = hoveredKey === String(p.process_id);
            const isActive = activeMark?.processId === p.process_id;

            const pathD = curve
              .map(
                (pt, i) =>
                  `${i === 0 ? "M" : "L"} ${xScale(pt.batch_size).toFixed(1)} ${yScale(pt.cost).toFixed(1)}`
              )
              .join(" ");

            const strokeDash =
              seat.dash === "dash"
                ? "6 3"
                : seat.dash === "dot"
                ? "2 3"
                : seat.dash === "dashdot"
                ? "6 3 2 3"
                : undefined;

            return (
              <g
                key={p.process_id}
                ref={roving.register(pIndex)}
                className="chart-mark"
                role="img"
                tabIndex={roving.tabIndexFor(pIndex)}
                aria-label={`${p.process_name}: custo estimado no lote ${formatNumber(result.batch_size)} é ${formatNumber(p.terms.total)}`}
                onFocus={() => {
                  roving.setActive(pIndex);
                  setActiveMark({
                    processId: p.process_id,
                    processName: p.process_name,
                    batchSize: result.batch_size,
                    cost: p.terms.total,
                  });
                }}
                onBlur={() => setActiveMark(null)}
              >
                {/* Curve path */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={seat.color}
                  strokeWidth={isActive || isHovered ? 3 : 2}
                  strokeDasharray={strokeDash}
                  opacity={hoveredKey && !isHovered ? 0.35 : 1}
                  style={{ transition: "stroke-width 0.15s, opacity 0.15s" }}
                />

                {/* Points on the curve */}
                {curve.map((pt) => {
                  const cx = xScale(pt.batch_size);
                  const cy = yScale(pt.cost);
                  const isCurrent = Math.abs(pt.batch_size - result.batch_size) < 1e-5;
                  const radius = isCurrent ? 5.5 : 4;

                  return (
                    <g
                      key={`pt-${pt.batch_size}`}
                      className="cursor-pointer"
                      onMouseEnter={() =>
                        setActiveMark({
                          processId: p.process_id,
                          processName: p.process_name,
                          batchSize: pt.batch_size,
                          cost: pt.cost,
                        })
                      }
                      onMouseLeave={() => setActiveMark(null)}
                    >
                      <MarkerSymbol
                        symbol={seat.symbol}
                        x={cx}
                        y={cy}
                        r={radius}
                        color={seat.color}
                        strokeWidth={isCurrent ? 2 : 1}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <ChartInfoLine>
          {activeMark
            ? `${activeMark.processName} — Lote: ${formatNumber(activeMark.batchSize)} un · Custo: ${formatNumber(activeMark.cost)}`
            : null}
        </ChartInfoLine>
      </div>
    </ChartFrame>
  );
}
