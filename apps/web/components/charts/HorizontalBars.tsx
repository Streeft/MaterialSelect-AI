"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChartLegend } from "./ChartLegend";
import { ChartTooltip, SERIES_SYMBOLS, type TooltipContent } from "./ChartTooltip";
import { linearTicks, makeScale, truncate, useChartWidth, useRovingFocus } from "./figureKit";
import type { ClassSymbol } from "@/lib/design/palette";

export interface BarSegment {
  key: string;
  label: string;
  /** A `tok()` string or a concrete colour. */
  color: string;
  /** The segment's shape in the legend and the tooltip (defaults by order). */
  symbol?: ClassSymbol;
}

export interface BarRow {
  key: string;
  label: string;
  /** One count per segment key. Counts only: every number here came from the API. */
  values: Record<string, number>;
  /** The number at the end of the row (a percentage the backend computed). */
  valueLabel?: string;
}

export type BarOrientation = "horizontal" | "vertical";

const BAR = 18;
const ROW = 32;
const VALUE_COLUMN = 92;
const PLOT_HEIGHT = 240;
const Y_AXIS = 44;
const X_LABELS = 30;
const RADIUS = 4;

/**
 * A rectangle whose data end is rounded and whose baseline end is square — the
 * bar grows out of the axis, it does not float over it (D-94).
 */
function barPath(x: number, y: number, w: number, h: number, end: "right" | "top", r: number) {
  const rr = Math.max(0, Math.min(r, end === "right" ? w / 2 : h / 2, end === "right" ? h / 2 : w / 2));
  if (end === "right") {
    return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
  }
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/**
 * The bar chart of the panel — stacked segments per category, drawn as
 * horizontal bars or as columns (D-94, the Google AI Studio figure).
 *
 * Both orientations read the same rows: the reader flips between them with the
 * chart-type switch in the card's corner, and nothing is recomputed. The
 * length of a segment is its count over the longest visible stack — pixel
 * scaling, the one piece of arithmetic a figure may do on the client (ADR
 * 0004); the value at the end of a row is the backend's, printed as sent.
 *
 * The hover target is the whole category band, not the painted pixels: the
 * band lights up and the tooltip lists every segment of that category, the
 * one under the pointer emphasised. Each segment is still its own keyboard
 * mark (roving tab index) with its own `aria-label`, and focusing one shows
 * the same tooltip.
 *
 * With `toggleable`, the legend hides and restores segments, and the scale
 * follows what is left. A hidden segment is never a zero-length bar: it is
 * gone, and the legend says so with `aria-pressed="false"`.
 */
export function HorizontalBars({
  figureLabel,
  segments,
  rows,
  orientation = "horizontal",
  toggleable = false,
  showLegend = true,
  axisTitle,
  describe,
}: {
  figureLabel: string;
  segments: BarSegment[];
  rows: BarRow[];
  orientation?: BarOrientation;
  toggleable?: boolean;
  /** Off when each row already names its only segment (one bar per category). */
  showLegend?: boolean;
  axisTitle?: string;
  /**
   * The words for one segment of one row: `aria` for the mark; `tip`, when
   * given, replaces the default tooltip (every segment of the row).
   */
  describe: (row: BarRow, segment: BarSegment) => { aria: string; info?: ReactNode; tip?: TooltipContent };
}) {
  const [measure, width] = useChartWidth();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<{ row: string; segment: string | null; focus: boolean } | null>(
    null,
  );

  const symbolOf = useMemo(
    () =>
      new Map(
        segments.map((s, i) => [s.key, s.symbol ?? SERIES_SYMBOLS[i % SERIES_SYMBOLS.length] ?? "circle"]),
      ),
    [segments],
  );
  const visible = useMemo(() => segments.filter((s) => !hidden.has(s.key)), [segments, hidden]);
  const maxTotal = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      const total = visible.reduce((sum, s) => sum + (row.values[s.key] ?? 0), 0);
      max = Math.max(max, total);
    }
    return max > 0 ? max : 1;
  }, [rows, visible]);

  // One flat reading order for the keyboard: row by row, segment by segment.
  const marks = useMemo(
    () =>
      rows.flatMap((row) =>
        visible
          .filter((segment) => (row.values[segment.key] ?? 0) > 0)
          .map((segment) => ({ row, segment })),
      ),
    [rows, visible],
  );
  const roving = useRovingFocus(marks.length);
  const markIndexOf = useMemo(
    () => new Map(marks.map((mark, i) => [`${mark.row.key}|${mark.segment.key}`, i])),
    [marks],
  );

  function tooltipFor(row: BarRow, segmentKey: string | null): TooltipContent {
    const focusSegment = visible.find((s) => s.key === segmentKey) ?? visible.find((s) => (row.values[s.key] ?? 0) > 0);
    const custom = focusSegment ? describe(row, focusSegment).tip : undefined;
    if (custom) return custom;
    return {
      title: row.label,
      rows: [
        ...visible.map((s) => ({
          key: s.key,
          label: s.label,
          value: (row.values[s.key] ?? 0).toLocaleString("pt-BR"),
          color: s.color,
          symbol: symbolOf.get(s.key),
          emphasis: visible.length > 1 && s.key === segmentKey,
        })),
      ],
      note: row.valueLabel,
    };
  }

  const activeRow = active ? rows.find((r) => r.key === active.row) : undefined;
  const tip = activeRow ? tooltipFor(activeRow, active?.segment ?? null) : null;

  function toggle(key: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      // Never hide the last visible segment: an empty figure explains nothing.
      else if (visible.length > 1) next.add(key);
      return next;
    });
  }

  const W = width ?? 0;
  const vertical = orientation === "vertical";

  // ---- geometry ---------------------------------------------------------
  const hasValues = rows.some((row) => row.valueLabel);
  // Horizontal
  const labelWidth = Math.min(140, Math.max(72, W * 0.28));
  const trackX = labelWidth + 12;
  const trackWidth = Math.max(40, W - trackX - (hasValues ? VALUE_COLUMN : 8));
  const hTop = 4;
  const hAxisY = hTop + rows.length * ROW + 2;
  // Vertical
  const plotX = Y_AXIS;
  const plotW = Math.max(40, W - plotX - 8);
  const plotTop = 18;
  const baseline = plotTop + PLOT_HEIGHT;
  const band = rows.length > 0 ? plotW / rows.length : plotW;
  const colW = Math.max(6, Math.min(56, band * 0.56));

  const height = vertical
    ? baseline + X_LABELS + (axisTitle ? 22 : 0)
    : hAxisY + (axisTitle ? 44 : 24);
  const length = makeScale([0, maxTotal], [0, vertical ? PLOT_HEIGHT : trackWidth]);
  const ticks = linearTicks(0, maxTotal, vertical ? 4 : trackWidth < 260 ? 3 : 5);
  const labelChars = vertical ? Math.max(3, Math.floor(band / 6.8)) : Math.floor(labelWidth / 6.6);

  function segmentMark(row: BarRow, segment: BarSegment, path: string, ri: number, si: number) {
    const index = markIndexOf.get(`${row.key}|${segment.key}`) ?? 0;
    const isActive = active?.row === row.key && active.segment === segment.key;
    const words = describe(row, segment);
    return (
      <g
        key={segment.key}
        ref={roving.register(index)}
        className="chart-mark"
        role="img"
        aria-label={words.aria}
        tabIndex={roving.tabIndexFor(index)}
        onMouseEnter={() => setActive({ row: row.key, segment: segment.key, focus: false })}
        onFocus={() => {
          roving.setActive(index);
          setActive({ row: row.key, segment: segment.key, focus: true });
        }}
        onBlur={() => setActive(null)}
      >
        <path
          className="chart-bar-seg"
          data-orientation={vertical ? "vertical" : "horizontal"}
          data-active={isActive ? "true" : "false"}
          d={path}
          style={{ fill: segment.color, animationDelay: `${ri * 60 + si * 40}ms` }}
        />
        {active?.focus && isActive ? <path className="chart-focus-ring" d={path} /> : null}
      </g>
    );
  }

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
          onMouseLeave={() => setActive(null)}
        >
          {vertical ? (
            <>
              {/* Horizontal hairlines at the ticks, values on the left. */}
              <g aria-hidden>
                {ticks.map((tick) => {
                  const y = baseline - length(tick);
                  return (
                    <g key={tick}>
                      <line className={tick === 0 ? "chart-axis" : "chart-grid"} x1={plotX} x2={plotX + plotW} y1={y} y2={y} />
                      <text className="chart-tick" x={plotX - 8} y={y} dominantBaseline="central" textAnchor="end">
                        {tick.toLocaleString("pt-BR")}
                      </text>
                    </g>
                  );
                })}
                {axisTitle ? (
                  <text className="chart-axis-title" x={plotX + plotW / 2} y={height - 4} textAnchor="middle">
                    {axisTitle}
                  </text>
                ) : null}
              </g>

              {rows.map((row, ri) => {
                const bandX = plotX + ri * band;
                const cx = bandX + band / 2;
                const x0 = cx - colW / 2;
                const rowActive = active?.row === row.key;
                const stack = visible.filter((s) => (row.values[s.key] ?? 0) > 0);
                let cursor = baseline;
                return (
                  <g key={row.key}>
                    {/* The band: the hover target is the category, not the ink. */}
                    <rect
                      aria-hidden
                      className={rowActive ? "chart-band" : undefined}
                      fill={rowActive ? undefined : "transparent"}
                      x={bandX}
                      y={plotTop}
                      width={band}
                      height={PLOT_HEIGHT}
                      onMouseEnter={() => setActive({ row: row.key, segment: null, focus: false })}
                    />
                    {stack.map((segment, si) => {
                      const h = length(row.values[segment.key] ?? 0);
                      const top = cursor - h;
                      const last = si === stack.length - 1;
                      // A 2 px surface gap between stacked fills (skill spec).
                      const gap = si > 0 ? 1 : 0;
                      const path = last
                        ? barPath(x0, top, colW, h - gap, "top", RADIUS)
                        : `M${x0},${top}H${x0 + colW}V${cursor - gap}H${x0}Z`;
                      cursor = top;
                      return segmentMark(row, segment, path, ri, si);
                    })}
                    {row.valueLabel && band >= 48 ? (
                      <text className="chart-value" x={cx} y={cursor - 6} textAnchor="middle" aria-hidden>
                        {row.valueLabel}
                      </text>
                    ) : null}
                    <text
                      className="chart-label"
                      data-active={rowActive ? "true" : "false"}
                      x={cx}
                      y={baseline + 16}
                      textAnchor="middle"
                      aria-hidden
                    >
                      {truncate(row.label, labelChars)}
                      {row.label.length > labelChars ? <title>{row.label}</title> : null}
                    </text>
                  </g>
                );
              })}
            </>
          ) : (
            <>
              {/* Vertical hairlines at the ticks, values under the axis. */}
              <g aria-hidden>
                {ticks.map((tick) => (
                  <g key={tick}>
                    <line
                      className={tick === 0 ? "chart-axis" : "chart-grid"}
                      x1={trackX + length(tick)}
                      x2={trackX + length(tick)}
                      y1={hTop}
                      y2={hAxisY}
                    />
                    <text className="chart-tick" x={trackX + length(tick)} y={hAxisY + 16} textAnchor="middle">
                      {tick.toLocaleString("pt-BR")}
                    </text>
                  </g>
                ))}
                {axisTitle ? (
                  <text className="chart-axis-title" x={trackX + trackWidth / 2} y={hAxisY + 36} textAnchor="middle">
                    {axisTitle}
                  </text>
                ) : null}
              </g>

              {rows.map((row, ri) => {
                const rowTop = hTop + ri * ROW;
                const y = rowTop + (ROW - BAR) / 2;
                const rowActive = active?.row === row.key;
                const stack = visible.filter((s) => (row.values[s.key] ?? 0) > 0);
                let cursor = trackX;
                return (
                  <g key={row.key}>
                    <rect
                      aria-hidden
                      className={rowActive ? "chart-band" : undefined}
                      fill={rowActive ? undefined : "transparent"}
                      x={0}
                      y={rowTop}
                      width={W}
                      height={ROW}
                      onMouseEnter={() => setActive({ row: row.key, segment: null, focus: false })}
                    />
                    <text
                      className="chart-label"
                      data-active={rowActive ? "true" : "false"}
                      x={labelWidth}
                      y={y + BAR / 2}
                      dominantBaseline="central"
                      textAnchor="end"
                      aria-hidden
                    >
                      {truncate(row.label, labelChars)}
                      {row.label.length > labelChars ? <title>{row.label}</title> : null}
                    </text>
                    {stack.map((segment, si) => {
                      const w = length(row.values[segment.key] ?? 0);
                      const start = cursor;
                      const last = si === stack.length - 1;
                      const gap = si > 0 ? 1 : 0;
                      const path = last
                        ? barPath(start + gap, y, w - gap, BAR, "right", RADIUS)
                        : `M${start + gap},${y}H${start + w}V${y + BAR}H${start + gap}Z`;
                      cursor += w;
                      return segmentMark(row, segment, path, ri, si);
                    })}
                    {row.valueLabel ? (
                      <text
                        className="chart-value"
                        x={W - 4}
                        y={y + BAR / 2}
                        dominantBaseline="central"
                        textAnchor="end"
                        aria-hidden
                      >
                        {row.valueLabel}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </>
          )}
        </svg>
      ) : (
        <div style={{ height: vertical ? PLOT_HEIGHT + 60 : hTop + rows.length * ROW + 44 }} />
      )}

      <ChartTooltip content={tip} />

      {showLegend && segments.length > 1 ? (
        <ChartLegend
          items={segments.map((s) => ({ key: s.key, label: s.label, color: s.color, symbol: symbolOf.get(s.key) }))}
          hidden={hidden}
          onToggle={toggleable ? toggle : undefined}
        />
      ) : null}
    </div>
  );
}
