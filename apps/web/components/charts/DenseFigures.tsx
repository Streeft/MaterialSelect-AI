"use client";

import {
  memo,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ptBR } from "@/lib/i18n";
import { MarkerSymbol, ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";
import { makeScale, truncate, useChartWidth } from "./figureKit";
import {
  NORMALISED_TICKS,
  legendItems,
  polar,
  scoreWords,
  scoreTip,
  seriesTip,
  seriesWords,
  useHiddenSeries,
  type CompareAxisView,
  type CompareSeries,
  type FigureProps,
  type ScoreOf,
} from "./comparisonShared";
import {
  FIGURE_MAX_HEIGHT,
  barAt,
  barMetrics,
  lineOpacity,
  lineWidth,
  parallelHeight,
} from "./comparisonDensity";

/*
 * D-187 — the comparison figures for a whole selection.
 *
 * Up to `DENSE_FROM` materials the figures keep one focusable mark per bar or
 * vertex (ComparisonFigures.tsx). Past it that is thousands of nodes and tab
 * stops, so these three draw lean instead:
 *
 * - one SVG, one tab stop; the arrows walk the materials, and the one in focus
 *   is written under the figure and drawn on top (so keyboard and pointer reach
 *   the same details);
 * - the static marks are built once (`useMemo`), so a pointer moving over them
 *   re-renders a handful of overlay elements, not thousands of bars;
 * - lines are hairlines whose opacity fades with the count (`lineOpacity`); what
 *   is hovered or focused is drawn again on top, thick, in full colour, and the
 *   rest dims through one attribute on the root, not through each line.
 *
 * The exported SVG is the whole figure (nothing is windowed away), and the table
 * view still carries every number (D-31). A missing score stays a hatched gap,
 * never a zero (D-24).
 */

const t = ptBR.compare;
const tc = ptBR.chart;

/** A scroll box for a figure taller than a screen; a figure that fits is left alone. */
export function ScrollFrame({ tall, children }: { tall: boolean; children: ReactNode }) {
  if (!tall) return <>{children}</>;
  return (
    <div className="chart-scroll-frame" role="region" aria-label={t.scrollRegion}>
      {children}
    </div>
  );
}

/** The sentence under a dense figure: what the pointer or the keyboard is on. */
function Readout({ words, live }: { words: string | null; live: boolean }) {
  return (
    <p className="chart-readout" aria-live={live ? "polite" : "off"}>
      {words ? tc.denseReadout(words) : tc.denseKeys}
    </p>
  );
}

function pointsOf(coords: [number, number][]): string {
  return coords.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

type BarCursor = { series: number; slug: string; key: boolean };

/**
 * Grouped bars for a whole selection: a minimum bar thickness, a plot as tall
 * as the count asks for, and a scroll box around it. A pointer or arrow keys
 * pick a bar by arithmetic (`barAt`), not by a node per bar.
 */
export function DenseBarsFigure({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const { hidden, toggle, setAll } = useHiddenSeries();
  const [hoverSeries, setHoverSeries] = useState<number | null>(null);
  const [active, setActive] = useState<BarCursor | null>(null);
  const [scrolled, setScrolled] = useState(0);
  const hatchId = `${useId().replace(/:/g, "")}-hatch`;
  const frame = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  const visible = useMemo(() => series.filter((s) => !hidden.has(String(s.id))), [series, hidden]);
  const n = Math.max(1, visible.length);
  const { bar, gap } = barMetrics(n);
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
  const layout = { top, groupHeight, groupGap, groups: axes.length, rows: visible.length, bar, gap };

  // The bars themselves: built once per geometry, untouched by hover and focus.
  const barsLayer = useMemo(
    () => (
      <g aria-hidden>
        {axes.map((axis, ai) => {
          const groupTop = top + ai * (groupHeight + groupGap);
          return (
            <g key={axis.slug}>
              <rect className="chart-track" x={trackX} y={groupTop} width={trackWidth} height={groupHeight} rx={3} />
              {visible.map((s, si) => {
                const value = score(s.id, axis.slug);
                const y = groupTop + si * (bar + gap);
                return value === null ? (
                  <rect
                    key={s.id}
                    x={trackX}
                    y={y}
                    width={Math.min(40, trackWidth)}
                    height={bar}
                    style={{ fill: `url(#${hatchId})`, stroke: "rgb(var(--quality-ausente) / 0.6)", strokeWidth: 0.5 }}
                  />
                ) : (
                  <rect
                    key={s.id}
                    x={trackX}
                    y={y}
                    width={Math.max(2, x(value) - trackX)}
                    height={bar}
                    style={{ fill: s.color }}
                  />
                );
              })}
            </g>
          );
        })}
      </g>
    ),
    // `x` is rebuilt every render but only depends on the two numbers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axes, visible, score, trackX, trackWidth, groupHeight, bar, gap, hatchId],
  );

  const activeSeries = active ? visible.find((s) => s.id === active.series) : undefined;
  const activeAxis = active ? axes.find((a) => a.slug === active.slug) : undefined;
  const activeValue = activeSeries && activeAxis ? score(activeSeries.id, activeAxis.slug) : null;
  const words =
    activeSeries && activeAxis ? scoreWords(activeSeries, activeAxis, activeValue).aria : null;
  const highlighted = active?.series ?? hoverSeries;

  const pick = (clientY: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const hit = barAt(clientY - box.top, layout);
    const axis = hit ? axes[hit.group] : undefined;
    const row = hit ? visible[hit.row] : undefined;
    setActive((current) => {
      if (!axis || !row) return current?.key ? current : null;
      if (current && current.series === row.id && current.slug === axis.slug && !current.key) return current;
      return { series: row.id, slug: axis.slug, key: false };
    });
  };

  const reveal = (group: number, row: number) => {
    const box = frame.current;
    if (!box) return;
    const y = top + group * (groupHeight + groupGap) + row * (bar + gap);
    if (y < box.scrollTop + 8) box.scrollTop = Math.max(0, y - 24);
    else if (y + bar > box.scrollTop + box.clientHeight - 8) box.scrollTop = y + bar - box.clientHeight + 24;
  };

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (visible.length === 0 || axes.length === 0) return;
    const group = active ? Math.max(0, axes.findIndex((a) => a.slug === active.slug)) : 0;
    const row = active ? Math.max(0, visible.findIndex((s) => s.id === active.series)) : 0;
    const index = group * visible.length + row;
    const last = axes.length * visible.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = active ? index + 1 : 0;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = active ? index - 1 : 0;
        break;
      case "PageDown":
        next = index + visible.length;
        break;
      case "PageUp":
        next = index - visible.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const clamped = Math.max(0, Math.min(last, next));
    const g = Math.floor(clamped / visible.length);
    const r = clamped % visible.length;
    const axis = axes[g];
    const row2 = visible[r];
    if (!axis || !row2) return;
    setActive({ series: row2.id, slug: axis.slug, key: true });
    reveal(g, r);
  }

  const tall = height > FIGURE_MAX_HEIGHT;
  const ring =
    active && activeSeries
      ? (() => {
          const g = axes.findIndex((a) => a.slug === active.slug);
          const r = visible.findIndex((s) => s.id === active.series);
          return g < 0 || r < 0 ? null : { y: top + g * (groupHeight + groupGap) + r * (bar + gap) };
        })()
      : null;

  return (
    <div ref={measure} className="relative min-w-0">
      {width !== null && visible.length > 0 ? (
        <>
          {tall ? (
            // The scale stays in view while the bars scroll under it.
            <svg aria-hidden className="chart-svg" width={W} height={24} viewBox={`0 0 ${W} 24`}>
              {NORMALISED_TICKS.map((tick) => (
                <text key={tick} className="chart-tick" x={x(tick)} y={16} textAnchor="middle">
                  {tick.toLocaleString("pt-BR")}
                </text>
              ))}
            </svg>
          ) : null}
          <div
            ref={frame}
            className={tall ? "chart-scroll-frame" : undefined}
            role={tall ? "region" : undefined}
            aria-label={tall ? t.scrollRegion : undefined}
            onScroll={(event) => setScrolled(event.currentTarget.scrollTop)}
          >
            <svg
              ref={svg}
              data-chart-figure
              role="figure"
              aria-label={figureLabel}
              tabIndex={0}
              className="chart-svg chart-dense"
              width={W}
              height={height}
              viewBox={`0 0 ${W} ${height}`}
              onKeyDown={onKeyDown}
              onPointerMove={(event) => pick(event.clientY)}
              onPointerLeave={() => setActive((current) => (current?.key ? current : null))}
              onBlur={() => setActive((current) => (current?.key ? null : current))}
            >
              <defs>
                <pattern id={hatchId} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width={4} height={4} style={{ fill: "var(--surface-300)" }} />
                  <line x1={0} y1={0} x2={0} y2={4} style={{ stroke: "rgb(var(--quality-ausente) / 0.6)", strokeWidth: 1.5 }} />
                </pattern>
              </defs>
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
                {axes.map((axis, ai) => {
                  const groupTop = top + ai * (groupHeight + groupGap);
                  // The property's name rides with the scroll inside its group,
                  // so it is on screen wherever in a tall group the reader is.
                  const labelY = Math.min(groupTop + groupHeight - 10, Math.max(groupTop + 10, scrolled + 18));
                  return (
                    <text
                      key={axis.slug}
                      className="chart-label"
                      data-active={active?.slug === axis.slug ? "true" : "false"}
                      x={labelWidth}
                      y={labelY}
                      dominantBaseline="central"
                      textAnchor="end"
                    >
                      {truncate(axis.name, labelChars)}
                      {axis.name.length > labelChars ? <title>{axis.name}</title> : null}
                    </text>
                  );
                })}
              </g>
              {barsLayer}
              <g aria-hidden>
                {highlighted !== null
                  ? axes.map((axis, ai) => {
                      const r = visible.findIndex((s) => s.id === highlighted);
                      if (r < 0) return null;
                      const y = top + ai * (groupHeight + groupGap) + r * (bar + gap);
                      return (
                        <rect
                          key={axis.slug}
                          className="chart-focus-ring"
                          x={trackX - 1}
                          y={y - 1}
                          width={trackWidth + 2}
                          height={bar + 2}
                          rx={2}
                          style={{ strokeWidth: 1.5 }}
                        />
                      );
                    })
                  : null}
                {ring && active?.key ? (
                  <rect className="chart-focus-ring" x={trackX - 3} y={ring.y - 3} width={trackWidth + 6} height={bar + 6} rx={3} />
                ) : null}
              </g>
            </svg>
          </div>
        </>
      ) : (
        <div style={{ height: Math.max(80, height) }} />
      )}
      <ChartTooltip
        content={
          active && !active.key && activeAxis && activeSeries
            ? scoreTip(activeAxis, visible, activeSeries.id, score)
            : null
        }
      />
      <Readout words={words} live={active?.key === true} />
      <ChartLegend
        items={legendItems(series)}
        hidden={hidden}
        onToggle={toggle}
        onSetAll={(hide) => setAll(hide, series)}
        onHover={(key) => setHoverSeries(key === null ? null : Number(key))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lines (radar and parallel coordinates)
// ---------------------------------------------------------------------------

/** One material's path, thin, plus a wide invisible stroke to be easy to hover. */
const DenseLine = memo(function DenseLine({
  id,
  runs,
  closed,
  color,
  width,
  fill,
  onEnter,
  onLeave,
}: {
  id: number;
  /** Each run as a ready `points` string; a gap in the data ends a run (D-24). */
  runs: string[];
  closed: boolean;
  color: string;
  width: number;
  fill: boolean;
  onEnter: (id: number) => void;
  onLeave: () => void;
}) {
  const Shape = closed ? "polygon" : "polyline";
  return (
    <g onPointerEnter={() => onEnter(id)} onPointerLeave={onLeave}>
      {runs.map((points, i) => (
        <Shape
          key={i}
          className="chart-dense-line"
          points={points}
          style={{
            fill: fill ? color : "none",
            fillOpacity: fill ? 0.04 : undefined,
            stroke: color,
            strokeWidth: width,
            strokeLinejoin: "round",
            strokeLinecap: "round",
          }}
        />
      ))}
      {runs.map((points, i) => (
        <Shape
          key={`hit-${i}`}
          points={points}
          style={{ fill: "none", stroke: "transparent", strokeWidth: 9, pointerEvents: "stroke" }}
        />
      ))}
    </g>
  );
});

/** The shared behaviour of both line figures: which series is on, by pointer or by arrows. */
function useDenseSeries(visible: CompareSeries[]) {
  const [hover, setHover] = useState<number | null>(null);
  const [legendHover, setLegendHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const onEnter = useCallback((id: number) => setHover(id), []);
  const onLeave = useCallback(() => setHover(null), []);

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (visible.length === 0) return;
    const index = cursor === null ? -1 : visible.findIndex((s) => s.id === cursor);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = index < 0 ? 0 : index - 1;
        break;
      case "PageDown":
        next = index + 10;
        break;
      case "PageUp":
        next = index - 10;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = visible.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const clamped = Math.max(0, Math.min(visible.length - 1, next));
    setCursor(visible[clamped]?.id ?? null);
  }

  const highlighted = cursor ?? hover ?? legendHover;
  return {
    highlighted,
    keyed: cursor !== null,
    hover,
    cursor,
    onEnter,
    onLeave,
    onKeyDown,
    setLegendHover,
    clearCursor: () => setCursor(null),
  };
}

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------

/** The radar for a whole selection: hairline polygons, the one in focus on top. */
export function DenseRadarFigure({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const { hidden, toggle, setAll } = useHiddenSeries();
  const drawn = useMemo(() => series.filter((s) => s.complete), [series]);
  const visible = useMemo(() => drawn.filter((s) => !hidden.has(String(s.id))), [drawn, hidden]);
  const dense = useDenseSeries(visible);

  const W = width ?? 0;
  const size = Math.min(W, 560);
  const cx = W / 2;
  const cy = size / 2;
  const R = Math.max(40, size / 2 - 72);
  const count = Math.max(1, axes.length);
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / count;

  const paths = useMemo(() => {
    const result = new Map<number, string>();
    for (const s of visible) {
      result.set(
        s.id,
        pointsOf(axes.map((axis, i) => polar(cx, cy, R * (score(s.id, axis.slug) ?? 0), angleFor(i)))),
      );
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, axes, score, cx, cy, R]);

  const n = visible.length;
  const width1 = lineWidth(n);
  const layer = useMemo(
    () => (
      <g aria-hidden>
        {visible.map((s) => (
          <DenseLine
            key={s.id}
            id={s.id}
            runs={[paths.get(s.id) ?? ""]}
            closed
            color={s.color}
            width={width1}
            fill={n <= 80}
            onEnter={dense.onEnter}
            onLeave={dense.onLeave}
          />
        ))}
      </g>
    ),
    [visible, paths, width1, n, dense.onEnter, dense.onLeave],
  );

  const hot = dense.highlighted !== null ? visible.find((s) => s.id === dense.highlighted) : undefined;
  const words = hot ? seriesWords(hot, axes, score) : null;

  return (
    <div ref={measure} className="relative min-w-0">
      {width !== null && drawn.length > 0 ? (
        <svg
          data-chart-figure
          role="figure"
          aria-label={figureLabel}
          tabIndex={0}
          className="chart-svg chart-dense"
          data-focus={hot ? "true" : "false"}
          style={{ ["--dense-opacity" as string]: lineOpacity(n) }}
          width={W}
          height={size}
          viewBox={`0 0 ${W} ${size}`}
          onKeyDown={dense.onKeyDown}
          onBlur={dense.clearCursor}
        >
          <g aria-hidden>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <polygon
                key={f}
                className="chart-grid"
                points={pointsOf(axes.map((_, i) => polar(cx, cy, R * f, angleFor(i))))}
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
              const room = anchor === "middle" ? W : anchor === "start" ? W - lx : lx;
              const chars = Math.max(5, Math.min(22, Math.floor((room - 4) / 6.4)));
              return (
                <g key={axis.slug}>
                  <line className="chart-grid" x1={cx} y1={cy} x2={px} y2={py} />
                  <text className="chart-label" x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle">
                    {truncate(axis.label, chars)}
                    {axis.label.length > chars ? <title>{axis.label}</title> : null}
                  </text>
                </g>
              );
            })}
          </g>
          {layer}
          {hot ? (
            <g aria-hidden pointerEvents="none">
              <polygon
                points={paths.get(hot.id) ?? ""}
                style={{ fill: hot.color, fillOpacity: 0.12, stroke: hot.color, strokeWidth: 3, strokeLinejoin: "round" }}
              />
              {axes.map((axis, i) => {
                const value = score(hot.id, axis.slug);
                if (value === null) return null;
                const [px, py] = polar(cx, cy, R * value, angleFor(i));
                return <MarkerSymbol key={axis.slug} symbol={hot.symbol} x={px} y={py} r={4.5} color={hot.color} />;
              })}
            </g>
          ) : null}
        </svg>
      ) : null}
      {drawn.length > 0 ? (
        <>
          <ChartTooltip
            content={dense.hover !== null && !dense.keyed && hot ? seriesTip(hot, axes, score) : null}
          />
          <Readout words={words} live={dense.keyed} />
          <ChartLegend
            items={legendItems(drawn)}
            hidden={hidden}
            onToggle={toggle}
            onSetAll={(hide) => setAll(hide, drawn)}
            onHover={(key) => dense.setLegendHover(key === null ? null : Number(key))}
          />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parallel coordinates
// ---------------------------------------------------------------------------

/** Runs of consecutive present values of one material; a gap ends a run, never bridged (D-24). */
function runsOf(
  id: number,
  axes: CompareAxisView[],
  score: ScoreOf,
  xFor: (i: number) => number,
  y: (value: number) => number,
): string[] {
  const runs: string[] = [];
  let run: [number, number][] = [];
  axes.forEach((axis, i) => {
    const value = score(id, axis.slug);
    if (value === null) {
      if (run.length > 1) runs.push(pointsOf(run));
      run = [];
    } else {
      run.push([xFor(i), y(value)]);
    }
  });
  if (run.length > 1) runs.push(pointsOf(run));
  return runs;
}

/** Parallel coordinates for a whole selection: hairlines on a plot as tall as the count asks. */
export function DenseParallelFigure({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const { hidden, toggle, setAll } = useHiddenSeries();
  const visible = useMemo(() => series.filter((s) => !hidden.has(String(s.id))), [series, hidden]);
  const dense = useDenseSeries(visible);

  const W = width ?? 0;
  const n = visible.length;
  const height = parallelHeight(Math.max(n, series.length));
  const padX = 34;
  const top = 18;
  const bottom = height - 58;
  const spacing = axes.length > 1 ? (W - padX * 2) / (axes.length - 1) : 0;
  const xFor = useCallback(
    (i: number) => (axes.length > 1 ? padX + i * spacing : W / 2),
    [axes.length, spacing, W],
  );
  const y = useMemo(() => makeScale([0, 1], [bottom, top]), [bottom]);
  const labelChars = Math.max(6, Math.floor((axes.length > 1 ? spacing : W) / 6.8));

  const runs = useMemo(() => {
    const result = new Map<number, string[]>();
    for (const s of visible) result.set(s.id, runsOf(s.id, axes, score, xFor, y));
    return result;
  }, [visible, axes, score, xFor, y]);

  const width1 = lineWidth(n);
  const layer = useMemo(
    () => (
      <g aria-hidden>
        {visible.map((s) => (
          <DenseLine
            key={s.id}
            id={s.id}
            runs={runs.get(s.id) ?? []}
            closed={false}
            color={s.color}
            width={width1}
            fill={false}
            onEnter={dense.onEnter}
            onLeave={dense.onLeave}
          />
        ))}
      </g>
    ),
    [visible, runs, width1, dense.onEnter, dense.onLeave],
  );

  const hot = dense.highlighted !== null ? visible.find((s) => s.id === dense.highlighted) : undefined;
  const words = hot ? seriesWords(hot, axes, score) : null;

  return (
    <div ref={measure} className="relative min-w-0">
      {width !== null ? (
        <svg
          data-chart-figure
          role="figure"
          aria-label={figureLabel}
          tabIndex={0}
          className="chart-svg chart-dense"
          data-focus={hot ? "true" : "false"}
          style={{ ["--dense-opacity" as string]: lineOpacity(n) }}
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          onKeyDown={dense.onKeyDown}
          onBlur={dense.clearCursor}
        >
          <g aria-hidden>
            {[0, 0.5, 1].map((tick) => (
              <g key={tick}>
                <line className="chart-grid" x1={xFor(0)} x2={xFor(axes.length - 1)} y1={y(tick)} y2={y(tick)} />
                <text className="chart-tick" x={xFor(0) - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
                  {tick.toLocaleString("pt-BR")}
                </text>
              </g>
            ))}
            {axes.map((axis, i) => (
              <g key={axis.slug}>
                <line className="chart-axis" x1={xFor(i)} x2={xFor(i)} y1={top} y2={bottom} />
                <text className="chart-label" x={xFor(i)} y={bottom + 18} textAnchor="middle">
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
          {layer}
          {hot ? (
            <g aria-hidden pointerEvents="none">
              {(runs.get(hot.id) ?? []).map((points, i) => (
                <polyline
                  key={i}
                  points={points}
                  style={{ fill: "none", stroke: hot.color, strokeWidth: 3, strokeLinejoin: "round", strokeLinecap: "round" }}
                />
              ))}
              {axes.map((axis, i) => {
                const value = score(hot.id, axis.slug);
                if (value === null) return null;
                return <MarkerSymbol key={axis.slug} symbol={hot.symbol} x={xFor(i)} y={y(value)} r={4.5} color={hot.color} />;
              })}
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      <ChartTooltip
        content={dense.hover !== null && !dense.keyed && hot ? seriesTip(hot, axes, score) : null}
      />
      <Readout words={words} live={dense.keyed} />
      <ChartLegend
        items={legendItems(series)}
        hidden={hidden}
        onToggle={toggle}
        onSetAll={(hide) => setAll(hide, series)}
        onHover={(key) => dense.setLegendHover(key === null ? null : Number(key))}
      />
    </div>
  );
}
