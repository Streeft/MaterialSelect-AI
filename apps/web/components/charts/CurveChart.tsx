"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Curve, CurveAxis, CurveSeries } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { paletteSeats, type ClassDash } from "@/lib/design/palette";
import { Badge } from "@/components/ui";
import { ChartFrame } from "./ChartFrame";
import { ChartLegend, MarkerSymbol, type LegendItem } from "./ChartLegend";
import { ChartTooltip, type TooltipContent } from "./ChartTooltip";
import { FigureData } from "./FigureData";
import { linearTicks, logTicks, makeScale, tok, useChartWidth, useRovingFocus } from "./figureKit";

const t = ptBR.curves;

/** The SVG dash pattern of a palette seat — the second identity of a line (D-28). */
export function dashArray(dash: ClassDash): string | undefined {
  switch (dash) {
    case "dash":
      return "7 4";
    case "dot":
      return "2 3";
    case "dashdot":
      return "7 3 2 3";
    case "longdash":
      return "12 4";
    case "longdashdot":
      return "12 3 2 3";
    default:
      return undefined;
  }
}

/** "Tensão de engenharia (MPa)"; a pure number (cycles) carries no unit. */
export function axisTitle(axis: CurveAxis): string {
  const name = axis.title ?? axis.quantity_label;
  return axis.unit_label ? `${name} (${axis.unit_label})` : name;
}

/** What the legend calls a series: the source's label, else its parameter. */
export function seriesName(curve: Curve, series: CurveSeries, index: number): string {
  if (series.label) return series.label;
  if (curve.parameter && series.parameter_value !== null) {
    return t.parameterLegend(
      formatNumber(series.parameter_value),
      curve.parameter.unit_label,
      curve.parameter.quantity_label,
    );
  }
  return t.seriesFallback(index + 1);
}

interface PointRow {
  key: string;
  seriesName: string;
  point: CurveSeries["points"][number];
}

interface Active {
  seriesIndex: number;
  position: number | null;
}

/**
 * A material curve (D-106): a family of lines, an optional band, and the table
 * of points it was drawn from (D-31).
 *
 * Every coordinate arrives computed (ADR 0004): the polylines and the band
 * polygon in reading units, the padded domain of each axis, the scale. This
 * component maps data to pixels with `makeScale` and places ticks — the two
 * presentation steps `figureKit` owns — and nothing else. A point the scale
 * cannot show (≤ 0 on a log axis) is simply not in `path`; it is in the table,
 * marked, and the backend's note says how many.
 *
 * Each series is told apart three ways — colour, dash and marker — so the
 * family still reads in grey print and for colour-blind readers.
 */
export function CurveChart({
  curve,
  controls,
  exportItems,
  headingLevel = 3,
}: {
  curve: Curve;
  controls?: ReactNode;
  exportItems?: ReactNode;
  headingLevel?: 2 | 3 | 4;
}) {
  const [measure, width] = useChartWidth();
  const seats = useMemo(() => paletteSeats(), []);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [active, setActive] = useState<Active | null>(null);

  const names = curve.series.map((series, index) => seriesName(curve, series, index));
  const visible = curve.series
    .map((series, index) => ({ series, index }))
    .filter(({ series }) => !hidden.has(String(series.id)));
  const roving = useRovingFocus(visible.length);

  const legend: LegendItem[] = curve.series.map((series, index) => {
    const seat = seats[index % seats.length]!;
    return { key: String(series.id), label: names[index], color: seat.color, symbol: seat.symbol };
  });

  const rows: PointRow[] = curve.series.flatMap((series, index) =>
    series.points.map((point) => ({
      key: `${series.id}-${point.position}`,
      seriesName: names[index] ?? t.seriesFallback(index + 1),
      point,
    })),
  );

  const xUnit = curve.x_axis.unit_label;
  const yUnit = curve.y_axis.unit_label;
  const withUnit = (value: number, unit: string) =>
    unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
  const original = (value: number, unit: string) =>
    unit === "dimensionless" ? formatNumber(value) : `${formatNumber(value)} ${prettyUnit(unit)}`;

  const table = (
    <FigureData<PointRow>
      caption={t.tableCaption(curve.title)}
      rows={rows}
      rowKey={(row) => row.key}
      rowHeader={{ header: t.columnSeries, cell: (row) => row.seriesName }}
      columns={[
        {
          key: "position",
          header: t.columnPoint,
          numeric: true,
          cell: (row) =>
            row.point.drawn
              ? String(row.point.position + 1)
              : `${row.point.position + 1} — ${t.notDrawn}`,
        },
        {
          key: "x",
          header: axisTitle(curve.x_axis),
          numeric: true,
          cell: (row) => formatNumber(row.point.x),
        },
        {
          key: "y",
          header: axisTitle(curve.y_axis),
          numeric: true,
          cell: (row) => formatNumber(row.point.y),
        },
        {
          key: "band",
          header: t.columnBand,
          numeric: true,
          // A band the source did not give is a declared state, written out —
          // never a blank or a dash (D-24).
          cell: (row) =>
            row.point.y_min !== null && row.point.y_max !== null
              ? `${formatNumber(row.point.y_min)} – ${formatNumber(row.point.y_max)}`
              : t.noBand,
        },
        {
          key: "original",
          header: t.columnOriginal,
          cell: (row) =>
            `${original(row.point.x_original, curve.x_axis.original_unit)} × ${original(
              row.point.y_original,
              curve.y_axis.original_unit,
            )}`,
        },
      ]}
    />
  );

  const footer = (
    <div className="flex flex-col gap-2">
      <ChartLegend
        items={legend}
        hidden={hidden}
        onToggle={(key) =>
          setHidden((previous) => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        onHover={setHovered}
      />
      {curve.series.some((series) => series.band) ? (
        <p className="text-caption text-ink-muted">
          <svg width={18} height={10} aria-hidden className="mr-1 inline-block align-middle">
            <rect width={18} height={10} rx={2} fill={tok("--ink-muted", 0.18)} />
          </svg>
          {t.band}
        </p>
      ) : null}
      {curve.notes.map((note) => (
        <p key={note} className="text-caption text-ink-muted">
          {note}
        </p>
      ))}
      <div className="flex flex-col gap-0.5 text-caption text-ink-muted">
        {curve.is_demo ? (
          <span>
            <Badge tone="warning">{ptBR.demoBadge}</Badge> {t.demo}
          </span>
        ) : null}
        <span>{t.source(curve.source_label)}</span>
        {curve.citation ? <span>{t.citation(curve.citation)}</span> : null}
        <span>
          {t.conversion("x", prettyUnit(curve.x_axis.original_unit), curve.x_axis.conversion_method)}{" "}
          {t.conversion("y", prettyUnit(curve.y_axis.original_unit), curve.y_axis.conversion_method)}
        </span>
      </div>
    </div>
  );

  const domainX = curve.x_axis.domain;
  const domainY = curve.y_axis.domain;
  const drawable = domainX !== null && domainY !== null && curve.series.some((s) => s.path.length > 0);

  const W = width ?? 640;
  const H = 360;
  const margin = { top: 20, right: 24, bottom: 54, left: 72 };
  const plotWidth = Math.max(40, W - margin.left - margin.right);
  const plotHeight = Math.max(40, H - margin.top - margin.bottom);
  const plotRight = margin.left + plotWidth;
  const plotBottom = margin.top + plotHeight;

  const xScale = makeScale(domainX ?? [0, 1], [margin.left, plotRight], curve.x_axis.log);
  const yScale = makeScale(domainY ?? [0, 1], [plotBottom, margin.top], curve.y_axis.log);
  const ticks = (axis: CurveAxis) =>
    axis.domain
      ? axis.log
        ? logTicks(axis.domain[0], axis.domain[1])
        : linearTicks(axis.domain[0], axis.domain[1])
      : [];
  const xTicks = ticks(curve.x_axis);
  const yTicks = ticks(curve.y_axis);
  const project = (pairs: [number, number][]) =>
    pairs.map(([x, y]) => `${xScale(x).toFixed(1)},${yScale(y).toFixed(1)}`);

  const tooltip: TooltipContent | null = (() => {
    if (!active) return null;
    const series = curve.series[active.seriesIndex];
    if (!series) return null;
    const seat = seats[active.seriesIndex % seats.length];
    const name = names[active.seriesIndex] ?? "";
    // By the point's own position, not the array index: the two agree today,
    // and only the first is the identity the backend promises.
    const point =
      active.position !== null ? series.points.find((p) => p.position === active.position) : undefined;
    if (!point) {
      return {
        title: name,
        rows: [
          {
            key: "points",
            label: t.columnPoint,
            value: String(series.points.length),
            color: seat?.color,
            symbol: seat?.symbol,
          },
        ],
        note: series.conditions ? t.conditions(series.conditions) : undefined,
      };
    }
    return {
      title: name,
      rows: [
        {
          key: "x",
          label: curve.x_axis.title ?? curve.x_axis.quantity_label,
          value: withUnit(point.x, xUnit),
          color: seat?.color,
          symbol: seat?.symbol,
        },
        {
          key: "y",
          label: curve.y_axis.title ?? curve.y_axis.quantity_label,
          value: withUnit(point.y, yUnit),
        },
        ...(point.y_min !== null && point.y_max !== null
          ? [
              {
                key: "band",
                label: t.columnBand,
                value: `${formatNumber(point.y_min)} – ${withUnit(point.y_max, yUnit)}`,
              },
            ]
          : []),
      ],
      note: series.conditions ? t.conditions(series.conditions) : undefined,
    };
  })();

  return (
    <ChartFrame
      title={curve.title}
      description={curve.kind_label}
      headingLevel={headingLevel}
      controls={controls}
      exportName={`curva-${curve.id}`}
      exportItems={exportItems}
      table={table}
      empty={
        drawable ? undefined : <p className="text-support text-ink-muted">{curve.notes[0] ?? t.curveError}</p>
      }
      footer={footer}
    >
      <div ref={measure} className="relative min-w-0">
        <svg
          data-chart-figure
          role="figure"
          aria-label={t.figureLabel(curve.title)}
          className="chart-svg select-none"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          onKeyDown={roving.onKeyDown}
        >
          <g aria-hidden>
            {xTicks.map((tick) => (
              <g key={`x-${tick}`}>
                <line
                  className="chart-grid"
                  x1={xScale(tick)}
                  x2={xScale(tick)}
                  y1={margin.top}
                  y2={plotBottom}
                />
                <text className="chart-tick" x={xScale(tick)} y={plotBottom + 16} textAnchor="middle">
                  {formatNumber(tick)}
                </text>
              </g>
            ))}
            {yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line
                  className="chart-grid"
                  x1={margin.left}
                  x2={plotRight}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                />
                <text className="chart-tick" x={margin.left - 8} y={yScale(tick) + 4} textAnchor="end">
                  {formatNumber(tick)}
                </text>
              </g>
            ))}
            <line className="chart-axis" x1={margin.left} x2={plotRight} y1={plotBottom} y2={plotBottom} />
            <line className="chart-axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={plotBottom} />
            <text
              className="chart-axis-title"
              x={margin.left + plotWidth / 2}
              y={plotBottom + 42}
              textAnchor="middle"
            >
              {axisTitle(curve.x_axis)}
            </text>
            <text
              className="chart-axis-title"
              x={-(margin.top + plotHeight / 2)}
              y={16}
              textAnchor="middle"
              transform="rotate(-90)"
            >
              {axisTitle(curve.y_axis)}
            </text>
            {/* Bands first, under every line. */}
            {visible.map(({ series, index }) =>
              series.band ? (
                <polygon
                  key={`band-${series.id}`}
                  data-curve-band
                  points={project(series.band).join(" ")}
                  fill={seats[index % seats.length]!.color}
                  fillOpacity={0.16}
                  stroke="none"
                />
              ) : null,
            )}
          </g>

          {visible.map(({ series, index }, visibleIndex) => {
            const seat = seats[index % seats.length]!;
            const key = String(series.id);
            const emphasised = hovered === key || active?.seriesIndex === index;
            const dimmed = hovered !== null && hovered !== key;
            const drawnPoints = series.points.filter((p) => p.drawn);
            return (
              <g
                key={key}
                ref={roving.register(visibleIndex)}
                className="chart-mark"
                role="img"
                tabIndex={roving.tabIndexFor(visibleIndex)}
                aria-label={t.seriesAria(names[index] ?? "", series.path.length)}
                onFocus={() => {
                  roving.setActive(visibleIndex);
                  setActive({ seriesIndex: index, position: null });
                }}
                onBlur={() => setActive(null)}
              >
                <polyline
                  data-curve-line
                  points={project(series.path).join(" ")}
                  fill="none"
                  stroke={seat.color}
                  strokeWidth={emphasised ? 3 : 2}
                  strokeDasharray={dashArray(seat.dash)}
                  strokeLinejoin="round"
                  opacity={dimmed ? 0.3 : 1}
                />
                {drawnPoints.map((point) => (
                  <g
                    key={point.position}
                    className="cursor-pointer"
                    onMouseEnter={() => setActive({ seriesIndex: index, position: point.position })}
                    onMouseLeave={() => setActive(null)}
                  >
                    <MarkerSymbol
                      symbol={seat.symbol}
                      x={xScale(point.x)}
                      y={yScale(point.y)}
                      r={3.6}
                      color={seat.color}
                    />
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
        <ChartTooltip content={tooltip} />
      </div>
    </ChartFrame>
  );
}
