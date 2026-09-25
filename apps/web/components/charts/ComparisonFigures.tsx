"use client";

import { useId, useMemo, useState } from "react";
import type { ClassSymbol } from "@/lib/design/palette";
import { ptBR } from "@/lib/i18n";
import { formatScore } from "@/lib/format";
import { SPRING, useSpring } from "@/lib/msds";
import { ChartLegend, MarkerSymbol, type LegendItem } from "./ChartLegend";
import { ChartTooltip, type TooltipContent } from "./ChartTooltip";
import { makeScale, tok, truncate, useChartWidth, useRovingFocus } from "./figureKit";

const t = ptBR.compare;
const tc = ptBR.chart;

/** One compared material, as every comparison figure draws it. */
export interface CompareSeries {
  id: number;
  name: string;
  className: string;
  color: string;
  symbol: ClassSymbol;
  complete: boolean;
}

/** One compared property: a short label for a crowded axis, the full name for words. */
export interface CompareAxisView {
  slug: string;
  label: string;
  name: string;
  /** How many compared materials have no value here — counted by the API. */
  missing: number;
}

/**
 * The backend's normalised score (0–1, 1 = best among the compared), or `null`
 * when the material has no value — a gap, never a zero (D-24).
 */
export type ScoreOf = (seriesId: number, slug: string) => number | null;

interface FigureProps {
  figureLabel: string;
  series: CompareSeries[];
  axes: CompareAxisView[];
  score: ScoreOf;
}

const absent = ptBR.quality.AUSENTE;

function legendItems(series: CompareSeries[]): LegendItem[] {
  return series.map((s) => ({ key: String(s.id), label: s.name, color: s.color, symbol: s.symbol }));
}

/** The legend's show/hide state, shared by every comparison figure. */
function useHiddenSeries() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return { hidden, toggle };
}

function scoreWords(series: CompareSeries, axis: CompareAxisView, value: number | null) {
  const shown = value === null ? absent : formatScore(value);
  return { aria: `${series.name} (${series.className}) — ${axis.name}: ${shown}` };
}

/**
 * The shared readout of one property (D-95, the AI Studio tooltip): the
 * property on top, then every drawn material's normalised score on it, the
 * one under the pointer emphasised. A material with no value says so in words
 * (D-24) — never a zero.
 */
function scoreTip(
  axis: CompareAxisView,
  drawn: CompareSeries[],
  activeId: number,
  score: ScoreOf,
): TooltipContent {
  return {
    title: axis.name,
    rows: drawn.map((s) => {
      const value = score(s.id, axis.slug);
      return {
        key: String(s.id),
        label: s.name,
        value: value === null ? absent : formatScore(value),
        color: s.color,
        symbol: s.symbol,
        emphasis: s.id === activeId,
      };
    }),
    note: tc.normalizedNote,
  };
}

const NORMALISED_TICKS = [0, 0.25, 0.5, 0.75, 1];

// ---------------------------------------------------------------------------
// Grouped bars
// ---------------------------------------------------------------------------

/**
 * MSDS `BarChart`, grouped: one group per property, one bar per material on a
 * 0–1 track (D-80).
 *
 * A material with no value draws no bar — and the empty slot says "Ausente" in
 * the quality token's colour inside a dashed outline, so a missing score cannot
 * be read as a short one (D-24). A score of exactly 0 is a real value (worst
 * among the compared) and keeps a visible stub.
 */
export function GroupedBarsFigure({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const { hidden, toggle } = useHiddenSeries();
  const [hoverSeries, setHoverSeries] = useState<number | null>(null);
  const [active, setActive] = useState<{ series: number; slug: string; focus: boolean } | null>(null);

  const visible = useMemo(() => series.filter((s) => !hidden.has(String(s.id))), [series, hidden]);
  const marks = useMemo(
    () => axes.flatMap((axis) => visible.map((s) => ({ axis, series: s }))),
    [axes, visible],
  );
  const roving = useRovingFocus(marks.length);

  const n = Math.max(1, visible.length);
  const bar = n <= 4 ? 14 : n <= 8 ? 11 : 9;
  const gap = 3;
  const groupGap = 16;
  const groupHeight = n * bar + (n - 1) * gap;
  const W = width ?? 0;
  const labelWidth = Math.min(170, Math.max(80, W * 0.26));
  const trackX = labelWidth + 12;
  const trackWidth = Math.max(40, W - trackX - 12);
  const top = 4;
  const plotBottom = top + axes.length * (groupHeight + groupGap) - groupGap;
  const axisY = plotBottom + 8;
  const height = axisY + 26;
  const x = makeScale([0, 1], [trackX, trackX + trackWidth]);
  const labelChars = Math.floor(labelWidth / 6.6);
  const activeMark = active
    ? marks.find((m) => m.series.id === active.series && m.axis.slug === active.slug)
    : undefined;

  return (
    <div ref={measure} className="relative min-w-0">
      {width !== null && visible.length > 0 ? (
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
            {NORMALISED_TICKS.map((tick) => (
              <g key={tick}>
                <line className="chart-grid" x1={x(tick)} x2={x(tick)} y1={top} y2={axisY} />
                <text className="chart-tick" x={x(tick)} y={axisY + 16} textAnchor="middle">
                  {tick.toLocaleString("pt-BR")}
                </text>
              </g>
            ))}
            <line className="chart-axis" x1={trackX} x2={trackX + trackWidth} y1={axisY} y2={axisY} />
          </g>

          {axes.map((axis, ai) => {
            const groupTop = top + ai * (groupHeight + groupGap);
            const groupActive = active?.slug === axis.slug;
            return (
              <g key={axis.slug}>
                <text
                  className="chart-label"
                  data-active={groupActive ? "true" : "false"}
                  x={labelWidth}
                  y={groupTop + groupHeight / 2}
                  dominantBaseline="central"
                  textAnchor="end"
                  aria-hidden
                >
                  {truncate(axis.name, labelChars)}
                  {axis.name.length > labelChars ? <title>{axis.name}</title> : null}
                </text>
                {visible.map((s, si) => {
                  const markIndex = ai * visible.length + si;
                  const y = groupTop + si * (bar + gap);
                  const value = score(s.id, axis.slug);
                  const isActive = groupActive && active?.series === s.id;
                  const words = scoreWords(s, axis, value);
                  return (
                    <g
                      key={s.id}
                      ref={roving.register(markIndex)}
                      className="chart-mark"
                      style={{ opacity: hoverSeries !== null && hoverSeries !== s.id ? 0.3 : 1 }}
                      role="img"
                      aria-label={words.aria}
                      tabIndex={roving.tabIndexFor(markIndex)}
                      onMouseEnter={() => setActive({ series: s.id, slug: axis.slug, focus: false })}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => {
                        roving.setActive(markIndex);
                        setActive({ series: s.id, slug: axis.slug, focus: true });
                      }}
                      onBlur={() => setActive(null)}
                    >
                      <rect className="chart-track" x={trackX} y={y} width={trackWidth} height={bar} rx={4} />
                      {value === null ? (
                        <g>
                          <rect
                            x={trackX + 0.5}
                            y={y + 0.5}
                            width={Math.min(62, trackWidth - 1)}
                            height={bar - 1}
                            rx={4}
                            style={{
                              fill: "rgb(var(--quality-ausente-soft))",
                              stroke: "rgb(var(--quality-ausente))",
                              strokeDasharray: "3 2",
                            }}
                          />
                          <text
                            className="chart-missing-text"
                            x={trackX + 7}
                            y={y + bar / 2 + 0.5}
                            dominantBaseline="central"
                            style={{ fontSize: Math.min(10, bar - 3) }}
                          >
                            {absent}
                          </text>
                        </g>
                      ) : (
                        <rect
                          className="chart-bar-seg"
                          data-active={isActive ? "true" : "false"}
                          x={trackX}
                          y={y}
                          width={Math.max(2, x(value) - trackX)}
                          height={bar}
                          rx={4}
                          style={{ fill: s.color, animationDelay: `${ai * 70 + si * 40}ms` }}
                        />
                      )}
                      {isActive && active?.focus ? (
                        <rect
                          className="chart-focus-ring"
                          x={trackX - 2}
                          y={y - 2}
                          width={trackWidth + 4}
                          height={bar + 4}
                          rx={6}
                        />
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height: Math.max(80, height) }} />
      )}
      <ChartTooltip
        content={activeMark ? scoreTip(activeMark.axis, visible, activeMark.series.id, score) : null}
      />
      <ChartLegend
        items={legendItems(series)}
        hidden={hidden}
        onToggle={toggle}
        onHover={(key) => setHoverSeries(key === null ? null : Number(key))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

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
  const presence = (useSpring as (target: number, preset: unknown, from?: number) => number)(
    off ? 0 : 1,
    SPRING.spatialDefault,
    0,
  );
  return (
    <polygon
      className="chart-radar-series"
      points={points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}
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
export function RadarFigure({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const { hidden, toggle } = useHiddenSeries();
  const [hoverSeries, setHoverSeries] = useState<number | null>(null);
  const [active, setActive] = useState<{ series: number; slug: string } | null>(null);

  const drawn = useMemo(() => series.filter((s) => s.complete), [series]);
  const visible = useMemo(() => drawn.filter((s) => !hidden.has(String(s.id))), [drawn, hidden]);
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
    ? marks.find((m) => m.series.id === active.series && m.axis.slug === active.slug)
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
              <text key={f} className="chart-tick" x={cx + 4} y={cy - R * f - 3}>
                {f.toLocaleString("pt-BR")}
              </text>
            ))}
            {axes.map((axis, i) => {
              const [px, py] = polar(cx, cy, R, angleFor(i));
              const [lx, ly] = polar(cx, cy, R + 18, angleFor(i));
              const anchor = Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
              // What fits between the label's anchor and the edge of the figure.
              const room = anchor === "middle" ? W : anchor === "start" ? W - lx : lx;
              const chars = Math.max(5, Math.min(22, Math.floor((room - 4) / 6.4)));
              return (
                <g key={axis.slug}>
                  <line className="chart-grid" x1={cx} y1={cy} x2={px} y2={py} />
                  <text
                    className="chart-label"
                    data-active={active?.slug === axis.slug ? "true" : "false"}
                    x={lx}
                    y={ly}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                  >
                    {truncate(axis.label, chars)}
                    {axis.label.length > chars ? <title>{axis.label}</title> : null}
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
                points={axes.map((axis, i) => polar(cx, cy, R * (score(s.id, axis.slug) ?? 0), angleFor(i)))}
              />
            ))}
          </g>

          {visible.map((s, si) =>
            axes.map((axis, i) => {
              const markIndex = si * axes.length + i;
              const value = score(s.id, axis.slug);
              if (value === null) return null; // unreachable: only complete series are drawn
              const [px, py] = polar(cx, cy, R * value, angleFor(i));
              const isActive = active?.series === s.id && active.slug === axis.slug;
              const words = scoreWords(s, axis, value);
              return (
                <g
                  key={`${s.id}-${axis.slug}`}
                  ref={roving.register(markIndex)}
                  className="chart-mark"
                  role="img"
                  aria-label={words.aria}
                  tabIndex={roving.tabIndexFor(markIndex)}
                  style={{ opacity: highlighted !== null && highlighted !== s.id ? 0.3 : 1 }}
                  onMouseEnter={() => setActive({ series: s.id, slug: axis.slug })}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => {
                    roving.setActive(markIndex);
                    setActive({ series: s.id, slug: axis.slug });
                  }}
                  onBlur={() => setActive(null)}
                >
                  <circle cx={px} cy={py} r={9} style={{ fill: "transparent" }} />
                  <MarkerSymbol symbol={s.symbol} x={px} y={py} r={isActive ? 5.5 : 3.8} color={s.color} />
                  {isActive ? <circle className="chart-focus-ring" cx={px} cy={py} r={9} /> : null}
                </g>
              );
            }),
          )}
        </svg>
      ) : null}
      {drawn.length > 0 ? (
        <>
          <ChartTooltip
            content={activeMark ? scoreTip(activeMark.axis, visible, activeMark.series.id, score) : null}
          />
          <ChartLegend items={legendItems(drawn)} hidden={hidden} onToggle={toggle} onHover={(key) => setHoverSeries(key === null ? null : Number(key))} />
        </>
      ) : null}
    </div>
  );
}

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
export function ParallelFigure({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const { hidden, toggle } = useHiddenSeries();
  const [hoverSeries, setHoverSeries] = useState<number | null>(null);
  const [active, setActive] = useState<{ series: number; slug: string } | null>(null);

  const visible = useMemo(() => series.filter((s) => !hidden.has(String(s.id))), [series, hidden]);
  const marks = useMemo(
    () =>
      visible.flatMap((s) =>
        axes.filter((axis) => score(s.id, axis.slug) !== null).map((axis) => ({ series: s, axis })),
      ),
    [visible, axes, score],
  );
  const roving = useRovingFocus(marks.length);
  const markIndexOf = useMemo(
    () => new Map(marks.map((mark, i) => [`${mark.series.id}|${mark.axis.slug}`, i])),
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
  const labelChars = Math.max(6, Math.floor((axes.length > 1 ? spacing : W) / 6.8));
  const highlighted = active?.series ?? hoverSeries;
  const activeMark = active
    ? marks.find((m) => m.series.id === active.series && m.axis.slug === active.slug)
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
                <text className="chart-tick" x={xFor(0) - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
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
                  {axis.label.length > labelChars ? <title>{axis.label}</title> : null}
                </text>
                {axis.missing > 0 ? (
                  <text className="chart-missing-text" x={xFor(i)} y={bottom + 34} textAnchor="middle">
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
                  points={points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}
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
              const isActive = active?.series === s.id && active.slug === axis.slug;
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
                  onMouseEnter={() => setActive({ series: s.id, slug: axis.slug })}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => {
                    roving.setActive(markIndex);
                    setActive({ series: s.id, slug: axis.slug });
                  }}
                  onBlur={() => setActive(null)}
                >
                  <circle cx={xFor(i)} cy={y(value)} r={9} style={{ fill: "transparent" }} />
                  <MarkerSymbol
                    symbol={s.symbol}
                    x={xFor(i)}
                    y={y(value)}
                    r={highlighted === s.id ? 5 : 3.8}
                    color={s.color}
                  />
                  {isActive ? <circle className="chart-focus-ring" cx={xFor(i)} cy={y(value)} r={9} /> : null}
                </g>
              );
            }),
          )}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      <ChartTooltip
        content={activeMark ? scoreTip(activeMark.axis, visible, activeMark.series.id, score) : null}
      />
      <ChartLegend
        items={legendItems(series)}
        hidden={hidden}
        onToggle={toggle}
        onHover={(key) => setHoverSeries(key === null ? null : Number(key))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

/**
 * The sequential scale, from MSDS's `HEATMAP_STEPS`: the section's own brand
 * ramp read as a data ramp, so the figure invents no second ramp of colour.
 * MSDS opened the ramp on `--surface-300`, the colour of an empty cell; here
 * the first step is `--brand-50`, because the worst score among the compared is
 * a value and must not look like a missing one.
 */
const HEAT_STEPS = [
  "--brand-50",
  "--brand-100",
  "--brand-200",
  "--brand-300",
  "--brand-500",
  "--brand-600",
  "--brand-700",
  "--brand-800",
  "--brand-900",
] as const;

function heatStep(value: number): string {
  const i = Math.round(Math.max(0, Math.min(1, value)) * (HEAT_STEPS.length - 1));
  return tok(HEAT_STEPS[i] ?? HEAT_STEPS[0]);
}

/**
 * MSDS `Heatmap` (D-80): materials × properties on the shared 0–1 scale, the
 * value appearing in the cell under the pointer or the focus.
 *
 * A missing cell is hatched and outlined in the absence token, and the scale
 * under the figure names it "Ausente" beside the ramp — never an empty square,
 * never the lightest step of the ramp (D-24).
 */
export function HeatmapFigure({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const [active, setActive] = useState<{ series: number; slug: string; focus: boolean } | null>(null);
  const hatchId = `${useId().replace(/:/g, "")}-hatch`;
  const roving = useRovingFocus(series.length * axes.length, axes.length);

  const W = width ?? 0;
  const labelWidth = Math.min(180, Math.max(90, W * 0.28));
  const gap = 3;
  const cols = Math.max(1, axes.length);
  const cell = Math.max(22, Math.min(48, Math.floor((W - labelWidth - 12) / cols) - gap));
  const longest = axes.reduce((max, axis) => Math.max(max, Math.min(axis.label.length, 22)), 0);
  const rotate = longest * 6.4 > cell + gap;
  const header = rotate ? Math.min(120, longest * 6.4 * 0.72 + 14) : 22;
  const gridX = labelWidth + 10;
  const gridTop = header + 4;
  const gridBottom = gridTop + series.length * (cell + gap);
  const scaleY = gridBottom + 18;
  const labelChars = Math.floor(labelWidth / 6.6);
  const activeSeries = active ? series.find((s) => s.id === active.series) : undefined;
  const activeAxis = active ? axes.find((a) => a.slug === active.slug) : undefined;

  // The scale under the grid: "0 (pior)" [ramp] "1 (melhor)" [hatch] "Ausente".
  // On a narrow card the absence entry takes a second line rather than
  // running off the figure.
  const swatch = 16;
  const lowText = t.heatLow;
  const highText = t.heatHigh;
  const rampX = lowText.length * 6.2 + 8;
  const rampEnd = rampX + HEAT_STEPS.length * (swatch + 2);
  const inline = rampEnd + highText.length * 6.2 + 28 + swatch + 60 <= W;
  const absentX = inline ? rampEnd + highText.length * 6.2 + 28 : 0;
  const absentY = inline ? scaleY : scaleY + 20;
  const height = absentY + 22;

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
          <defs>
            <pattern id={hatchId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={6} height={6} style={{ fill: "var(--surface-300)" }} />
              <line x1={0} y1={0} x2={0} y2={6} style={{ stroke: "rgb(var(--quality-ausente) / 0.55)", strokeWidth: 2 }} />
            </pattern>
          </defs>

          <g aria-hidden>
            {axes.map((axis, ci) => {
              const cx = gridX + ci * (cell + gap) + cell / 2;
              const text = truncate(axis.label, 22);
              return rotate ? (
                <text
                  key={axis.slug}
                  className="chart-tick"
                  data-active={active?.slug === axis.slug ? "true" : "false"}
                  transform={`translate(${cx + 3} ${header}) rotate(-40)`}
                  textAnchor="start"
                >
                  {text}
                  {axis.label.length > 22 ? <title>{axis.label}</title> : null}
                </text>
              ) : (
                <text key={axis.slug} className="chart-tick" x={cx} y={header - 4} textAnchor="middle">
                  {text}
                </text>
              );
            })}
            {series.map((s, ri) => (
              <text
                key={s.id}
                className="chart-label"
                data-active={active?.series === s.id ? "true" : "false"}
                x={labelWidth}
                y={gridTop + ri * (cell + gap) + cell / 2}
                textAnchor="end"
                dominantBaseline="central"
              >
                {truncate(s.name, labelChars)}
                {s.name.length > labelChars ? <title>{s.name}</title> : null}
              </text>
            ))}
          </g>

          {series.map((s, ri) =>
            axes.map((axis, ci) => {
              const markIndex = ri * axes.length + ci;
              const value = score(s.id, axis.slug);
              const x = gridX + ci * (cell + gap);
              const y = gridTop + ri * (cell + gap);
              const isActive = active?.series === s.id && active.slug === axis.slug;
              const words = scoreWords(s, axis, value);
              const valueText = value === null ? absent : formatScore(value);
              const pillWidth = valueText.length * 6.4 + 8;
              return (
                <g
                  key={`${s.id}-${axis.slug}`}
                  ref={roving.register(markIndex)}
                  className="chart-mark chart-fade-in"
                  style={{ animationDelay: `${(ri + ci) * 25}ms` }}
                  role="img"
                  aria-label={words.aria}
                  tabIndex={roving.tabIndexFor(markIndex)}
                  onMouseEnter={() => setActive({ series: s.id, slug: axis.slug, focus: false })}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => {
                    roving.setActive(markIndex);
                    setActive({ series: s.id, slug: axis.slug, focus: true });
                  }}
                  onBlur={() => setActive(null)}
                >
                  <rect
                    x={x}
                    y={y}
                    width={cell}
                    height={cell}
                    rx={4}
                    style={
                      value === null
                        ? {
                            fill: `url(#${hatchId})`,
                            stroke: "rgb(var(--quality-ausente))",
                            strokeDasharray: "3 2",
                            strokeWidth: 1,
                          }
                        : { fill: heatStep(value), stroke: "rgb(var(--edge))", strokeWidth: 1 }
                    }
                  />
                  {isActive ? (
                    <>
                      <rect className="chart-focus-ring" x={x - 1} y={y - 1} width={cell + 2} height={cell + 2} rx={5} />
                      {/* MSDS .msds-heat-value: the number on a surface pill,
                          legible over every step of the ramp. */}
                      <rect
                        x={x + cell / 2 - pillWidth / 2}
                        y={y + cell / 2 - 8}
                        width={pillWidth}
                        height={16}
                        rx={3}
                        style={{ fill: "var(--surface-200)" }}
                      />
                      <text
                        className="chart-value"
                        x={x + cell / 2}
                        y={y + cell / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ fontSize: 10, fontWeight: 600 }}
                      >
                        {valueText}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            }),
          )}

          <g aria-hidden>
            <text className="chart-tick" x={0} y={scaleY + 8} dominantBaseline="central">
              {lowText}
            </text>
            {HEAT_STEPS.map((step, i) => (
              <rect
                key={step}
                x={rampX + i * (swatch + 2)}
                y={scaleY + 3}
                width={swatch}
                height={10}
                rx={2}
                style={{ fill: tok(step), stroke: "rgb(var(--edge))", strokeWidth: 1 }}
              />
            ))}
            <text className="chart-tick" x={rampEnd + 6} y={scaleY + 8} dominantBaseline="central">
              {highText}
            </text>
            <rect
              x={absentX}
              y={absentY + 3}
              width={swatch}
              height={10}
              rx={2}
              style={{
                fill: `url(#${hatchId})`,
                stroke: "rgb(var(--quality-ausente))",
                strokeDasharray: "3 2",
                strokeWidth: 1,
              }}
            />
            <text className="chart-tick" x={absentX + swatch + 6} y={absentY + 8} dominantBaseline="central">
              {absent}
            </text>
          </g>
        </svg>
      ) : (
        <div style={{ height: 200 }} />
      )}
      <ChartTooltip
        content={activeSeries && activeAxis ? scoreTip(activeAxis, series, activeSeries.id, score) : null}
      />
    </div>
  );
}
