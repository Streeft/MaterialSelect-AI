"use client";

import { useMemo, useState } from "react";
import { SPRING, useSpring } from "@/lib/msds";
import { ChartLegend, MarkerSymbol } from "../ChartLegend";
import { ChartTooltip } from "../ChartTooltip";
import { truncate, useChartWidth, useRovingFocus } from "../figureKit";
import {
  legendItems,
  polar,
  scoreTip,
  scoreWords,
  useHiddenSeries,
  type FigureProps,
} from "../comparisonShared";
import { DENSE_FROM } from "../comparisonDensity";
import { DenseRadarFigure } from "../DenseFigures";

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------

/**
 * One radar series with its own spring (MSDS `RadarSeriesPolygon`): a new
 * series is born at 0 and settles at 1, and switching it off in the legend
 * collapses and fades it instead of blinking out.
 *
 * Unlike MSDS, a missing value is never `|| 0`: the caller only hands complete
 * series to the radar (a polygon with a gap would be read as a value), and
 * lists the rest (D-24).
 */
function RadarSeries({
  points,
  color,
  off,
  dim,
  cx,
  cy,
}: {
  points: [number, number][];
  color: string;
  off: boolean;
  dim: boolean;
  cx: number;
  cy: number;
}) {
  const presence = (
    useSpring as (target: number, preset: unknown, from?: number) => number
  )(off ? 0 : 1, SPRING.spatialDefault, 0);
  return (
    <polygon
      className="chart-radar-series"
      points={points
        .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
        .join(" ")}
      style={{
        fill: color,
        stroke: color,
        strokeWidth: 2,
        strokeLinejoin: "round",
        opacity: Math.max(0, presence) * (dim ? 0.3 : 1),
        transform: `scale(${Math.max(0.001, presence)})`,
        transformOrigin: `${cx}px ${cy}px`,
      }}
    />
  );
}

/**
 * MSDS `RadarChart` (D-80): rings at a quarter, half, three quarters and the
 * whole of the normalised scale; one spring-animated polygon per material; a
 * legend that hides and restores a series. Only materials with a value on
 * every axis are drawn — the rest are listed above the figure by the caller.
 */
export function RadarFigure(props: FigureProps) {
  // D-187: past DENSE_FROM the polygons are thin, translucent and highlighted on demand.
  return props.series.filter((s) => s.complete).length > DENSE_FROM ? (
    <DenseRadarFigure {...props} />
  ) : (
    <Radar {...props} />
  );
}

function Radar({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const { hidden, toggle, setAll, isolate } = useHiddenSeries();
  const [hoverSeries, setHoverSeries] = useState<number | null>(null);
  const [active, setActive] = useState<{ series: number; slug: string } | null>(
    null,
  );

  const drawn = useMemo(() => series.filter((s) => s.complete), [series]);
  const visible = useMemo(
    () => drawn.filter((s) => !hidden.has(String(s.id))),
    [drawn, hidden],
  );
  const marks = useMemo(
    () => visible.flatMap((s) => axes.map((axis) => ({ series: s, axis }))),
    [visible, axes],
  );
  const roving = useRovingFocus(marks.length);

  const W = width ?? 0;
  const size = Math.min(W, 540);
  const cx = W / 2;
  const cy = size / 2;
  const R = Math.max(40, size / 2 - 72);
  const n = Math.max(1, axes.length);
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const highlighted = active?.series ?? hoverSeries;
  const activeMark = active
    ? marks.find(
        (m) => m.series.id === active.series && m.axis.slug === active.slug,
      )
    : undefined;

  return (
    <div ref={measure} className="relative min-w-0">
      {width !== null && drawn.length > 0 ? (
        <svg
          data-chart-figure
          role="figure"
          aria-label={figureLabel}
          className="chart-svg"
          width={W}
          height={size}
          viewBox={`0 0 ${W} ${size}`}
          onKeyDown={roving.onKeyDown}
        >
          <g aria-hidden>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <polygon
                key={f}
                className="chart-grid"
                points={axes
                  .map((_, i) => polar(cx, cy, R * f, angleFor(i)))
                  .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
                  .join(" ")}
              />
            ))}
            {[0.5, 1].map((f) => (
              <text
                key={f}
                className="chart-tick"
                x={cx + 4}
                y={cy - R * f - 3}
              >
                {f.toLocaleString("pt-BR")}
              </text>
            ))}
            {axes.map((axis, i) => {
              const [px, py] = polar(cx, cy, R, angleFor(i));
              const [lx, ly] = polar(cx, cy, R + 18, angleFor(i));
              const anchor =
                Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
              // What fits between the label's anchor and the edge of the figure.
              const room =
                anchor === "middle" ? W : anchor === "start" ? W - lx : lx;
              const chars = Math.max(
                5,
                Math.min(22, Math.floor((room - 4) / 6.4)),
              );
              return (
                <g key={axis.slug}>
                  <line
                    className="chart-grid"
                    x1={cx}
                    y1={cy}
                    x2={px}
                    y2={py}
                  />
                  <text
                    className="chart-label"
                    data-active={active?.slug === axis.slug ? "true" : "false"}
                    x={lx}
                    y={ly}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                  >
                    {truncate(axis.label, chars)}
                    {axis.label.length > chars ? (
                      <title>{axis.label}</title>
                    ) : null}
                  </text>
                </g>
              );
            })}
          </g>

          <g aria-hidden>
            {drawn.map((s) => (
              <RadarSeries
                key={s.id}
                color={s.color}
                off={hidden.has(String(s.id))}
                dim={highlighted !== null && highlighted !== s.id}
                cx={cx}
                cy={cy}
                points={axes.map((axis, i) =>
                  polar(cx, cy, R * (score(s.id, axis.slug) ?? 0), angleFor(i)),
                )}
              />
            ))}
          </g>

          {visible.map((s, si) =>
            axes.map((axis, i) => {
              const markIndex = si * axes.length + i;
              const value = score(s.id, axis.slug);
              if (value === null) return null; // unreachable: only complete series are drawn
              const [px, py] = polar(cx, cy, R * value, angleFor(i));
              const isActive =
                active?.series === s.id && active.slug === axis.slug;
              const words = scoreWords(s, axis, value);
              return (
                <g
                  key={`${s.id}-${axis.slug}`}
                  ref={roving.register(markIndex)}
                  className="chart-mark"
                  role="img"
                  aria-label={words.aria}
                  tabIndex={roving.tabIndexFor(markIndex)}
                  style={{
                    opacity:
                      highlighted !== null && highlighted !== s.id ? 0.3 : 1,
                  }}
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
                    cx={px}
                    cy={py}
                    r={9}
                    style={{ fill: "transparent" }}
                  />
                  <MarkerSymbol
                    symbol={s.symbol}
                    x={px}
                    y={py}
                    r={isActive ? 5.5 : 3.8}
                    color={s.color}
                  />
                  {isActive ? (
                    <circle
                      className="chart-focus-ring"
                      cx={px}
                      cy={py}
                      r={9}
                    />
                  ) : null}
                </g>
              );
            }),
          )}
        </svg>
      ) : null}
      {drawn.length > 0 ? (
        <>
          <ChartTooltip
            content={
              activeMark
                ? scoreTip(
                    activeMark.axis,
                    visible,
                    activeMark.series.id,
                    score,
                  )
                : null
            }
          />
          <ChartLegend
            items={legendItems(drawn)}
            hidden={hidden}
            onToggle={toggle}
            onIsolate={isolate}
            onSetAll={(hide) => setAll(hide, drawn)}
            onHover={(key) => setHoverSeries(key === null ? null : Number(key))}
          />
        </>
      ) : null}
    </div>
  );
}

