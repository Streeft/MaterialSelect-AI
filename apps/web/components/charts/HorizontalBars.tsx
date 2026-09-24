"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { ChartInfoLine, ChartLegend } from "./ChartLegend";
import { linearTicks, makeScale, truncate, useChartWidth, useRovingFocus } from "./figureKit";

export interface BarSegment {
  key: string;
  label: string;
  /** A `tok()` string or a concrete colour. */
  color: string;
}

export interface BarRow {
  key: string;
  label: string;
  /** One count per segment key. Counts only: every number here came from the API. */
  values: Record<string, number>;
  /** The number at the end of the row (a percentage the backend computed). */
  valueLabel?: string;
}

const TRACK = 20;
const ROW = 30;
const VALUE_COLUMN = 92;

/**
 * MSDS `BarChart`: horizontal rows, stacked segments on a rounded track, each
 * segment growing in from the baseline, staggered by row (D-80).
 *
 * Drawn in SVG rather than MSDS's `<div>`s so the figure exports as a figure.
 * The length of a segment is its count over the longest visible row — pixel
 * scaling, the one piece of arithmetic a figure may do on the client (ADR 0004);
 * the percentage at the end of each row is the backend's, printed as sent.
 *
 * With `toggleable`, the legend hides and restores segments, and the scale
 * follows the rows that are left — the MSDS legend behaviour. A hidden segment
 * is never drawn as a zero-length bar: it is gone from the stack, and the
 * legend says so with a strike-through and `aria-pressed="false"`.
 */
export function HorizontalBars({
  figureLabel,
  segments,
  rows,
  toggleable = false,
  showLegend = true,
  axisTitle,
  describe,
}: {
  figureLabel: string;
  segments: BarSegment[];
  rows: BarRow[];
  toggleable?: boolean;
  /** Off when each row already names its only segment (one bar per category). */
  showLegend?: boolean;
  axisTitle?: string;
  /** The words for one segment of one row: `aria` for the mark, `info` for the hover line. */
  describe: (row: BarRow, segment: BarSegment) => { aria: string; info: ReactNode };
}) {
  const [measure, width] = useChartWidth();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<{ row: string; segment: string; focus: boolean } | null>(
    null,
  );
  const clipBase = useId().replace(/:/g, "");

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

  const hasValues = rows.some((row) => row.valueLabel);
  const W = width ?? 0;
  const labelWidth = Math.min(140, Math.max(72, W * 0.28));
  const trackX = labelWidth + 12;
  const trackWidth = Math.max(40, W - trackX - (hasValues ? VALUE_COLUMN : 8));
  const top = 4;
  const axisY = top + rows.length * ROW + 2;
  const height = axisY + (axisTitle ? 44 : 24);
  const x = makeScale([0, maxTotal], [0, trackWidth]);
  const ticks = linearTicks(0, maxTotal, trackWidth < 260 ? 3 : 5);
  const labelChars = Math.floor(labelWidth / 6.6);

  const activeMark = active
    ? marks.find((m) => m.row.key === active.row && m.segment.key === active.segment)
    : undefined;

  function toggle(key: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      // Never hide the last visible segment: an empty figure explains nothing.
      else if (visible.length > 1) next.add(key);
      return next;
    });
  }

  return (
    <div ref={measure} className="min-w-0">
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
            {rows.map((row, ri) => (
              <clipPath key={row.key} id={`${clipBase}-row-${ri}`}>
                <rect x={trackX} y={top + ri * ROW + (ROW - TRACK) / 2} width={trackWidth} height={TRACK} rx={8} />
              </clipPath>
            ))}
          </defs>

          <g aria-hidden>
            {ticks.map((tick) => (
              <g key={tick}>
                <line className="chart-axis" x1={trackX + x(tick)} x2={trackX + x(tick)} y1={axisY} y2={axisY + 4} />
                <text className="chart-tick" x={trackX + x(tick)} y={axisY + 16} textAnchor="middle">
                  {tick.toLocaleString("pt-BR")}
                </text>
              </g>
            ))}
            <line className="chart-axis" x1={trackX} x2={trackX + trackWidth} y1={axisY} y2={axisY} />
            {axisTitle ? (
              <text className="chart-axis-title" x={trackX + trackWidth / 2} y={axisY + 36} textAnchor="middle">
                {axisTitle}
              </text>
            ) : null}
          </g>

          {rows.map((row, ri) => {
            const y = top + ri * ROW + (ROW - TRACK) / 2;
            const rowActive = active?.row === row.key;
            let cursor = trackX;
            return (
              <g key={row.key}>
                <text
                  className="chart-label"
                  data-active={rowActive ? "true" : "false"}
                  x={labelWidth}
                  y={y + TRACK / 2}
                  dominantBaseline="central"
                  textAnchor="end"
                  aria-hidden
                >
                  {truncate(row.label, labelChars)}
                  {row.label.length > labelChars ? <title>{row.label}</title> : null}
                </text>
                <rect className="chart-track" x={trackX} y={y} width={trackWidth} height={TRACK} rx={8} aria-hidden />
                <g clipPath={`url(#${clipBase}-row-${ri})`}>
                  {visible.map((segment, si) => {
                    const value = row.values[segment.key] ?? 0;
                    if (value <= 0) return null;
                    const index = markIndexOf.get(`${row.key}|${segment.key}`) ?? 0;
                    const start = cursor;
                    const length = x(value);
                    cursor += length;
                    const isActive = rowActive && active?.segment === segment.key;
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
                        onMouseLeave={() => setActive(null)}
                        onFocus={() => {
                          roving.setActive(index);
                          setActive({ row: row.key, segment: segment.key, focus: true });
                        }}
                        onBlur={() => setActive(null)}
                      >
                        <rect
                          className="chart-bar-seg"
                          data-active={isActive ? "true" : "false"}
                          x={start}
                          y={y}
                          width={length}
                          height={TRACK}
                          style={{ fill: segment.color, animationDelay: `${ri * 70 + si * 50}ms` }}
                        />
                        {visible.slice(si + 1).some((next) => (row.values[next.key] ?? 0) > 0) ? (
                          <line
                            x1={cursor}
                            x2={cursor}
                            y1={y}
                            y2={y + TRACK}
                            style={{ stroke: "var(--surface-200)", strokeWidth: 1.5 }}
                          />
                        ) : null}
                      </g>
                    );
                  })}
                </g>
                {active?.focus && rowActive
                  ? (() => {
                      // The ring sits outside the clip, so a focused segment at
                      // the rounded end of the track is still fully outlined.
                      let from = trackX;
                      for (const segment of visible) {
                        const value = row.values[segment.key] ?? 0;
                        if (segment.key === active.segment) {
                          return (
                            <rect
                              className="chart-focus-ring"
                              x={from - 1.5}
                              y={y - 1.5}
                              width={Math.max(3, x(value) + 3)}
                              height={TRACK + 3}
                              rx={5}
                            />
                          );
                        }
                        from += x(value);
                      }
                      return null;
                    })()
                  : null}
                {row.valueLabel ? (
                  <text
                    className="chart-value"
                    x={W - 4}
                    y={y + TRACK / 2}
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
        </svg>
      ) : (
        <div style={{ height: top + rows.length * ROW + 44 }} />
      )}

      <ChartInfoLine>
        {activeMark ? describe(activeMark.row, activeMark.segment).info : null}
      </ChartInfoLine>

      {showLegend && segments.length > 1 ? (
        <ChartLegend
          items={segments.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
          hidden={hidden}
          onToggle={toggleable ? toggle : undefined}
        />
      ) : null}
    </div>
  );
}
