"use client";

import { useMemo, useState } from "react";
import { ChartLegend } from "../ChartLegend";
import { ChartTooltip } from "../ChartTooltip";
import { makeScale, truncate, useChartWidth, useRovingFocus } from "../figureKit";
import {
  NORMALISED_TICKS,
  absent,
  legendItems,
  scoreTip,
  scoreWords,
  useHiddenSeries,
  type FigureProps,
} from "../comparisonShared";
import { DENSE_FROM, FIGURE_MAX_HEIGHT, barMetrics } from "../comparisonDensity";
import { DenseBarsFigure, ScrollFrame } from "../DenseFigures";

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
export function GroupedBarsFigure(props: FigureProps) {
  // D-187: past DENSE_FROM the bars are drawn as one lean SVG with no mark per bar.
  return props.series.length > DENSE_FROM ? (
    <DenseBarsFigure {...props} />
  ) : (
    <GroupedBars {...props} />
  );
}

function GroupedBars({ figureLabel, series, axes, score }: FigureProps) {
  const [measure, width] = useChartWidth();
  const { hidden, toggle, setAll, isolate } = useHiddenSeries();
  const [hoverSeries, setHoverSeries] = useState<number | null>(null);
  const [active, setActive] = useState<{
    series: number;
    slug: string;
    focus: boolean;
  } | null>(null);

  const visible = useMemo(
    () => series.filter((s) => !hidden.has(String(s.id))),
    [series, hidden],
  );
  const marks = useMemo(
    () => axes.flatMap((axis) => visible.map((s) => ({ axis, series: s }))),
    [axes, visible],
  );
  const roving = useRovingFocus(marks.length);

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
  const activeMark = active
    ? marks.find(
        (m) => m.series.id === active.series && m.axis.slug === active.slug,
      )
    : undefined;

  return (
    <div ref={measure} className="relative min-w-0">
      {width !== null && visible.length > 0 ? (
        <ScrollFrame tall={height > FIGURE_MAX_HEIGHT}>
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
                  <line
                    className="chart-grid"
                    x1={x(tick)}
                    x2={x(tick)}
                    y1={top}
                    y2={axisY}
                  />
                  <text
                    className="chart-tick"
                    x={x(tick)}
                    y={axisY + 16}
                    textAnchor="middle"
                  >
                    {tick.toLocaleString("pt-BR")}
                  </text>
                </g>
              ))}
              <line
                className="chart-axis"
                x1={trackX}
                x2={trackX + trackWidth}
                y1={axisY}
                y2={axisY}
              />
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
                    {axis.name.length > labelChars ? (
                      <title>{axis.name}</title>
                    ) : null}
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
                        style={{
                          opacity:
                            hoverSeries !== null && hoverSeries !== s.id
                              ? 0.3
                              : 1,
                        }}
                        role="img"
                        aria-label={words.aria}
                        tabIndex={roving.tabIndexFor(markIndex)}
                        onMouseEnter={() =>
                          setActive({
                            series: s.id,
                            slug: axis.slug,
                            focus: false,
                          })
                        }
                        onMouseLeave={() => setActive(null)}
                        onFocus={() => {
                          roving.setActive(markIndex);
                          setActive({
                            series: s.id,
                            slug: axis.slug,
                            focus: true,
                          });
                        }}
                        onBlur={() => setActive(null)}
                      >
                        <rect
                          className="chart-track"
                          x={trackX}
                          y={y}
                          width={trackWidth}
                          height={bar}
                          rx={4}
                        />
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
                            {bar >= 9 ? (
                              <text
                                className="chart-missing-text"
                                x={trackX + 7}
                                y={y + bar / 2 + 0.5}
                                dominantBaseline="central"
                                style={{ fontSize: Math.min(10, bar - 3) }}
                              >
                                {absent}
                              </text>
                            ) : null}
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
                            style={{
                              fill: s.color,
                              animationDelay: `${Math.min(ai * 70 + si * 40, 600)}ms`,
                            }}
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
        </ScrollFrame>
      ) : (
        <div style={{ height: Math.max(80, height) }} />
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

