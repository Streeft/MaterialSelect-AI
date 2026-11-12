"use client";

import { useMemo, useState } from "react";
import { ptBR } from "@/lib/i18n";
import { ChartLegend, MarkerSymbol } from "../ChartLegend";
import { ChartTooltip } from "../ChartTooltip";
import { makeScale, truncate, useChartWidth, useRovingFocus } from "../figureKit";
import {
  legendItems,
  scoreTip,
  scoreWords,
  useHiddenSeries,
  type FigureProps,
} from "../comparisonShared";
import { DENSE_FROM } from "../comparisonDensity";
import { DenseParallelFigure } from "../DenseFigures";

const tc = ptBR.chart;

// ---------------------------------------------------------------------------
// Parallel coordinates
// ---------------------------------------------------------------------------

/**
 * MSDS `ParallelCoords` (D-80): one vertical axis per property on the shared
 * 0–1 scale, one line per material.
 *
 * A gap breaks the line — it is never interpolated across, and no point is
 * invented on the axis. Under each axis label the figure writes how many of the
 * compared materials have no value there (the API's own count), so the break is
 * explained where it happens instead of only in a note below the page.
 */
export function ParallelFigure(props: FigureProps) {
  // D-187: past DENSE_FROM the lines are hairlines, fading with the count, on a taller plot.
  return props.series.length > DENSE_FROM ? (
    <DenseParallelFigure {...props} />
  ) : (
    <Parallel {...props} />
  );
}

function Parallel({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const { hidden, toggle, setAll, isolate } = useHiddenSeries();
  const [hoverSeries, setHoverSeries] = useState<number | null>(null);
  const [active, setActive] = useState<{ series: number; slug: string } | null>(
    null,
  );

  const visible = useMemo(
    () => series.filter((s) => !hidden.has(String(s.id))),
    [series, hidden],
  );
  const marks = useMemo(
    () =>
      visible.flatMap((s) =>
        axes
          .filter((axis) => score(s.id, axis.slug) !== null)
          .map((axis) => ({ series: s, axis })),
      ),
    [visible, axes, score],
  );
  const roving = useRovingFocus(marks.length);
  const markIndexOf = useMemo(
    () =>
      new Map(
        marks.map((mark, i) => [`${mark.series.id}|${mark.axis.slug}`, i]),
      ),
    [marks],
  );

  const W = width ?? 0;
  const height = 340;
  const padX = 34;
  const top = 18;
  const bottom = height - 58;
  const spacing = axes.length > 1 ? (W - padX * 2) / (axes.length - 1) : 0;
  const xFor = (i: number) => (axes.length > 1 ? padX + i * spacing : W / 2);
  const y = makeScale([0, 1], [bottom, top]);
  const labelChars = Math.max(
    6,
    Math.floor((axes.length > 1 ? spacing : W) / 6.8),
  );
  const highlighted = active?.series ?? hoverSeries;
  const activeMark = active
    ? marks.find(
        (m) => m.series.id === active.series && m.axis.slug === active.slug,
      )
    : undefined;

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
            {[0, 0.5, 1].map((tick) => (
              <g key={tick}>
                <line
                  className="chart-grid"
                  x1={xFor(0)}
                  x2={xFor(axes.length - 1)}
                  y1={y(tick)}
                  y2={y(tick)}
                />
                <text
                  className="chart-tick"
                  x={xFor(0) - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {tick.toLocaleString("pt-BR")}
                </text>
              </g>
            ))}
            {axes.map((axis, i) => (
              <g key={axis.slug}>
                <line
                  className="chart-axis"
                  x1={xFor(i)}
                  x2={xFor(i)}
                  y1={top}
                  y2={bottom}
                  style={{ strokeWidth: active?.slug === axis.slug ? 2 : 1 }}
                />
                <text
                  className="chart-label"
                  data-active={active?.slug === axis.slug ? "true" : "false"}
                  x={xFor(i)}
                  y={bottom + 18}
                  textAnchor="middle"
                >
                  {truncate(axis.label, labelChars)}
                  {axis.label.length > labelChars ? (
                    <title>{axis.label}</title>
                  ) : null}
                </text>
                {axis.missing > 0 ? (
                  <text
                    className="chart-missing-text"
                    x={xFor(i)}
                    y={bottom + 34}
                    textAnchor="middle"
                  >
                    {tc.missingOnAxis(axis.missing)}
                  </text>
                ) : null}
              </g>
            ))}
          </g>

          <g aria-hidden>
            {visible.map((s) => {
              // Consecutive runs of present values; a gap ends a run.
              const runs: [number, number][][] = [];
              let run: [number, number][] = [];
              axes.forEach((axis, i) => {
                const value = score(s.id, axis.slug);
                if (value === null) {
                  if (run.length > 1) runs.push(run);
                  run = [];
                } else {
                  run.push([xFor(i), y(value)]);
                }
              });
              if (run.length > 1) runs.push(run);
              const dim = highlighted !== null && highlighted !== s.id;
              return runs.map((points, ri) => (
                <polyline
                  key={`${s.id}-${ri}`}
                  className="chart-fade-in"
                  points={points
                    .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
                    .join(" ")}
                  style={{
                    fill: "none",
                    stroke: s.color,
                    strokeWidth: highlighted === s.id ? 3 : 2,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    opacity: dim ? 0.15 : 0.9,
                  }}
                />
              ));
            })}
          </g>

          {visible.map((s) =>
            axes.map((axis, i) => {
              const value = score(s.id, axis.slug);
              if (value === null) return null;
              const markIndex = markIndexOf.get(`${s.id}|${axis.slug}`) ?? 0;
              const isActive =
                active?.series === s.id && active.slug === axis.slug;
              const dim = highlighted !== null && highlighted !== s.id;
              const words = scoreWords(s, axis, value);
              return (
                <g
                  key={`${s.id}-${axis.slug}`}
                  ref={roving.register(markIndex)}
                  className="chart-mark"
                  role="img"
                  aria-label={words.aria}
                  tabIndex={roving.tabIndexFor(markIndex)}
                  style={{ opacity: dim ? 0.2 : 1 }}
                  onMouseEnter={() =>
                    setActive({ series: s.id, slug: axis.slug })
                  }
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => {
                    roving.setActive(markIndex);
                    setActive({ series: s.id, slug: axis.slug });
                  }}
                  onBlur={() => setActive(null)}
                >
                  <circle
                    cx={xFor(i)}
                    cy={y(value)}
                    r={9}
                    style={{ fill: "transparent" }}
                  />
                  <MarkerSymbol
                    symbol={s.symbol}
                    x={xFor(i)}
                    y={y(value)}
                    r={highlighted === s.id ? 5 : 3.8}
                    color={s.color}
                  />
                  {isActive ? (
                    <circle
                      className="chart-focus-ring"
                      cx={xFor(i)}
                      cy={y(value)}
                      r={9}
                    />
                  ) : null}
                </g>
              );
            }),
          )}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      <ChartTooltip
        content={
          activeMark
            ? scoreTip(activeMark.axis, visible, activeMark.series.id, score)
            : null
        }
      />
      <ChartLegend
        items={legendItems(series)}
        hidden={hidden}
        onToggle={toggle}
        onIsolate={isolate}
        onSetAll={(hide) => setAll(hide, series)}
        onHover={(key) => setHoverSeries(key === null ? null : Number(key))}
      />
    </div>
  );
}

