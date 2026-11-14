"use client";

import { useMemo, useState } from "react";
import type { CostCurves, MaterialCostCurve } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { paletteSeats } from "@/lib/design/palette";
import { ChartFrame } from "./ChartFrame";
import { ChartLegend, type LegendItem, MarkerSymbol } from "./ChartLegend";
import { ChartTooltip, tipValue } from "./ChartTooltip";
import { FigureData, type FigureColumn } from "./FigureData";
import { logTicks, makeScale, useChartWidth, useRovingFocus } from "./figureKit";

const t = {
  title: "Curva Custo × Lote de cada material",
  description:
    "Custo unitário do jeito mais barato de fazer a peça, para cada material comparado, conforme o tamanho do lote (escala log-log). Cada ponto da curva é o processo mais barato naquele lote; o lote atual está marcado em cada curva.",
  axisBatch: "Tamanho do lote (peças)",
  axisCost: "Custo unitário estimado (unidade monetária)",
  currentBatch: (n: number) => `Lote atual (${formatNumber(n)} un)`,
  figureLabel: "Curva Custo versus Tamanho do Lote, um material por curva",
  tableBatch: "Lote (n)",
  tipBatch: "Lote",
  tipCost: "Custo unitário",
  tipProcess: "Processo mais barato",
  unavailable: (name: string, reason: string) => `${name}: ${reason}`,
  unavailableTitle: "Materiais sem curva",
  markerAria: (name: string, batch: string, cost: string, process: string) =>
    `${name} no lote atual de ${batch}: custo ${cost}, no processo ${process}`,
};

interface ActiveMark {
  materialId: number;
  name: string;
  batch: number;
  cost: number;
  process: string;
}

interface TableRow {
  batch: number;
  costs: Map<number, MaterialCostCurve["points"][number]>;
}

const nameOf = (curve: MaterialCostCurve) => curve.material_name ?? `#${curve.material_id}`;

/**
 * Cost × batch size for each compared material (D-234): one curve per material,
 * each the cheapest of its processes at every batch.
 *
 * **Every number is the server's** (`POST /api/custo/curvas`, ADR 0004): the points,
 * the process that wins at each, the marker of the current batch and the log-log
 * frame shared by every curve. This component only maps them to pixels. A material
 * the server could not price has no curve, and its written reason is shown under the
 * figure — never a flat line at zero.
 */
export function MaterialCostCurvesChart({ curves }: { curves: CostCurves }) {
  const [measure, width] = useChartWidth();
  const seats = useMemo(() => paletteSeats(), []);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveMark | null>(null);

  const drawn = useMemo(() => curves.curves.filter((curve) => curve.points.length > 0), [curves]);
  const unavailable = useMemo(() => curves.curves.filter((curve) => curve.points.length === 0), [curves]);
  const visible = useMemo(() => drawn.filter((curve) => !hidden.has(String(curve.material_id))), [drawn, hidden]);
  const roving = useRovingFocus(visible.length);

  const domain = curves.domain;
  const domainX = useMemo<[number, number]>(() => domain?.x ?? [1, 1], [domain]);
  const domainY = useMemo<[number, number]>(() => domain?.y ?? [1, 1], [domain]);

  const legendItems: LegendItem[] = useMemo(
    () =>
      drawn.map((curve, index) => {
        const seat = seats[index % seats.length]!;
        return {
          key: String(curve.material_id),
          label: nameOf(curve),
          color: seat.color,
          symbol: seat.symbol,
          dash: seat.dash,
        };
      }),
    [drawn, seats],
  );

  const toggle = (key: string) =>
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
  const currentX = xScale(curves.batch_size);
  const currentVisible = curves.batch_size >= domainX[0] && curves.batch_size <= domainX[1];

  const rows: TableRow[] = useMemo(
    () =>
      (domain?.batch_sizes ?? []).map((batch) => ({
        batch,
        costs: new Map(
          drawn.flatMap((curve) => {
            const point = curve.points.find((p) => Math.abs(p.batch_size - batch) < 1e-5);
            return point ? [[curve.material_id, point] as const] : [];
          }),
        ),
      })),
    [domain, drawn],
  );
  const columns: FigureColumn<TableRow>[] = useMemo(
    () =>
      visible.map((curve) => ({
        key: String(curve.material_id),
        header: nameOf(curve),
        numeric: true,
        cell: (row: TableRow) => {
          const point = row.costs.get(curve.material_id);
          return point ? `${formatNumber(point.cost)} (${point.process_name})` : null;
        },
      })),
    [visible],
  );

  if (drawn.length === 0) return null;

  return (
    <ChartFrame
      title={t.title}
      description={t.description}
      headingLevel={3}
      exportName="curva-custo-lote-materiais"
      table={
        <FigureData<TableRow>
          caption={t.figureLabel}
          rows={rows}
          rowKey={(row) => row.batch}
          rowHeader={{
            header: t.tableBatch,
            cell: (row) =>
              row.batch === curves.batch_size
                ? `${formatNumber(row.batch)} (${t.currentBatch(row.batch)})`
                : formatNumber(row.batch),
          }}
          columns={columns}
        />
      }
      footer={
        <>
          <ChartLegend
            items={legendItems}
            hidden={hidden}
            onToggle={toggle}
            onIsolate={(next) => setHidden(new Set(next))}
            onHover={setHoveredKey}
          />
          {unavailable.length > 0 ? (
            <div className="mt-2 text-caption text-ink-muted">
              <span className="font-medium text-ink">{t.unavailableTitle}</span>
              <ul className="list-disc pl-5">
                {unavailable.map((curve) => (
                  <li key={curve.material_id} className="min-w-0 break-words">
                    {t.unavailable(nameOf(curve), curve.reason ?? "")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      }
    >
      <div ref={measure} className="relative min-w-0">
        <svg
          data-chart-figure
          role="figure"
          aria-label={t.figureLabel}
          className="chart-svg select-none"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          onKeyDown={roving.onKeyDown}
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
              {t.axisBatch}
            </text>
            <text
              className="chart-axis-title"
              x={-(margin.top + plotHeight / 2)}
              y={18}
              textAnchor="middle"
              transform="rotate(-90)"
            >
              {t.axisCost}
            </text>
            {currentVisible ? (
              <g>
                <line
                  x1={currentX}
                  x2={currentX}
                  y1={margin.top}
                  y2={plotBottom}
                  stroke="rgb(var(--ink-subtle))"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <text x={currentX} y={margin.top - 8} textAnchor="middle" className="chart-label" style={{ fontSize: 11, fontWeight: 500 }}>
                  {t.currentBatch(curves.batch_size)}
                </text>
              </g>
            ) : null}
          </g>

          {visible.map((curve, position) => {
            const index = drawn.findIndex((item) => item.material_id === curve.material_id);
            const seat = seats[index % seats.length]!;
            const key = String(curve.material_id);
            const hovered = hoveredKey === key;
            const path = curve.points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.batch_size).toFixed(1)} ${yScale(p.cost).toFixed(1)}`)
              .join(" ");
            const dash =
              seat.dash === "dash" ? "6 3" : seat.dash === "dot" ? "2 3" : seat.dash === "dashdot" ? "6 3 2 3" : undefined;
            const marker = curve.current;
            return (
              <g
                key={key}
                ref={roving.register(position)}
                className="chart-mark"
                role="img"
                tabIndex={roving.tabIndexFor(position)}
                aria-label={
                  marker
                    ? t.markerAria(
                        nameOf(curve),
                        formatNumber(marker.batch_size),
                        formatNumber(marker.cost),
                        marker.process_name,
                      )
                    : nameOf(curve)
                }
                onFocus={() => {
                  roving.setActive(position);
                  if (marker) {
                    setActive({
                      materialId: curve.material_id,
                      name: nameOf(curve),
                      batch: marker.batch_size,
                      cost: marker.cost,
                      process: marker.process_name,
                    });
                  }
                }}
                onBlur={() => setActive(null)}
              >
                <path
                  d={path}
                  fill="none"
                  stroke={seat.color}
                  strokeWidth={hovered ? 3 : 2}
                  strokeDasharray={dash}
                  opacity={hoveredKey && !hovered ? 0.35 : 1}
                />
                {curve.points.map((p) => {
                  const current = Math.abs(p.batch_size - curves.batch_size) < 1e-5;
                  return (
                    <g
                      key={p.batch_size}
                      onMouseEnter={() =>
                        setActive({
                          materialId: curve.material_id,
                          name: nameOf(curve),
                          batch: p.batch_size,
                          cost: p.cost,
                          process: p.process_name,
                        })
                      }
                      onMouseLeave={() => setActive(null)}
                    >
                      <MarkerSymbol
                        symbol={seat.symbol}
                        x={xScale(p.batch_size)}
                        y={yScale(p.cost)}
                        r={current ? 6 : 3.5}
                        color={seat.color}
                        strokeWidth={current ? 2 : 1}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <ChartTooltip
          content={(() => {
            if (!active) return null;
            const index = drawn.findIndex((curve) => curve.material_id === active.materialId);
            const seat = seats[index % seats.length];
            return {
              title: active.name,
              rows: [
                { key: "batch", label: t.tipBatch, value: tipValue(active.batch, "un"), color: seat?.color, symbol: seat?.symbol },
                { key: "cost", label: t.tipCost, value: tipValue(active.cost) },
                { key: "process", label: t.tipProcess, value: active.process },
              ],
            };
          })()}
        />
      </div>
    </ChartFrame>
  );
}
