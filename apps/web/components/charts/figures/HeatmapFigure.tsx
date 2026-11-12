"use client";

import { useId, useMemo, useState } from "react";
import { ptBR } from "@/lib/i18n";
import { formatScore } from "@/lib/format";
import { ChartTooltip } from "../ChartTooltip";
import { tok, truncate, useChartWidth, useRovingFocus } from "../figureKit";
import { absent, scoreTip, scoreWords, type FigureProps } from "../comparisonShared";
import { DENSE_FROM } from "../comparisonDensity";

const t = ptBR.compare;

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
  const i = Math.round(
    Math.max(0, Math.min(1, value)) * (HEAT_STEPS.length - 1),
  );
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
export function HeatmapFigure({
  figureLabel,
  series,
  axes,
  score,
}: FigureProps) {
  const [measure, width] = useChartWidth();
  const [active, setActive] = useState<{
    series: number;
    slug: string;
    focus: boolean;
  } | null>(null);
  const hatchId = `${useId().replace(/:/g, "")}-hatch`;
  const dense = series.length > DENSE_FROM;
  const roving = useRovingFocus(series.length * axes.length, axes.length);

  const W = width ?? 0;
  const labelWidth = Math.min(180, Math.max(90, W * 0.28));
  const gap = 3;
  const cols = Math.max(1, axes.length);
  const cell = Math.max(
    22,
    Math.min(48, Math.floor((W - labelWidth - 12) / cols) - gap),
  );
  const longest = axes.reduce(
    (max, axis) => Math.max(max, Math.min(axis.label.length, 22)),
    0,
  );
  const rotate = longest * 6.4 > cell + gap;
  const header = rotate ? Math.min(120, longest * 6.4 * 0.72 + 14) : 22;
  const gridX = labelWidth + 10;
  const gridTop = header + 4;
  const gridBottom = gridTop + series.length * (cell + gap);
  const scaleY = gridBottom + 18;
  const labelChars = Math.floor(labelWidth / 6.6);
  const activeSeries = active
    ? series.find((s) => s.id === active.series)
    : undefined;
  const activeAxis = active
    ? axes.find((a) => a.slug === active.slug)
    : undefined;

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

  // D-187: the grid is built once per geometry (hundreds of rows are thousands of
  // cells); the pointer moving over it re-renders only the overlay below.
  const cellsLayer = useMemo(
    () => (
      <>
        {series.map((s, ri) =>
          axes.map((axis, ci) => {
            const markIndex = ri * axes.length + ci;
            const value = score(s.id, axis.slug);
            const x = gridX + ci * (cell + gap);
            const y = gridTop + ri * (cell + gap);
            const words = scoreWords(s, axis, value);
            return (
              <g
                key={`${s.id}-${axis.slug}`}
                ref={roving.register(markIndex)}
                className="chart-mark chart-fade-in"
                style={
                  dense
                    ? { animation: "none" }
                    : { animationDelay: `${Math.min((ri + ci) * 25, 600)}ms` }
                }
                role="img"
                aria-label={words.aria}
                tabIndex={roving.tabIndexFor(markIndex)}
                onMouseEnter={() =>
                  setActive({ series: s.id, slug: axis.slug, focus: false })
                }
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
                      : {
                          fill: heatStep(value),
                          stroke: "rgb(var(--edge))",
                          strokeWidth: 1,
                        }
                  }
                />
              </g>
            );
          }),
        )}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      series,
      axes,
      score,
      gridX,
      gridTop,
      cell,
      gap,
      hatchId,
      dense,
      roving.current,
    ],
  );
  const activeCell = (() => {
    if (!active) return null;
    const ci = axes.findIndex((a) => a.slug === active.slug);
    const ri = series.findIndex((s) => s.id === active.series);
    if (ci < 0 || ri < 0) return null;
    const value = score(active.series, active.slug);
    const x = gridX + ci * (cell + gap);
    const y = gridTop + ri * (cell + gap);
    const valueText = value === null ? absent : formatScore(value);
    const pillWidth = valueText.length * 6.4 + 8;
    return (
      <g pointerEvents="none" aria-hidden>
        <>
          <rect
            className="chart-focus-ring"
            x={x - 1}
            y={y - 1}
            width={cell + 2}
            height={cell + 2}
            rx={5}
          />
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
      </g>
    );
  })();

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
            <pattern
              id={hatchId}
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect
                width={6}
                height={6}
                style={{ fill: "var(--surface-300)" }}
              />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={6}
                style={{
                  stroke: "rgb(var(--quality-ausente) / 0.55)",
                  strokeWidth: 2,
                }}
              />
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
                <text
                  key={axis.slug}
                  className="chart-tick"
                  x={cx}
                  y={header - 4}
                  textAnchor="middle"
                >
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

          {cellsLayer}
          {activeCell}

          <g aria-hidden>
            <text
              className="chart-tick"
              x={0}
              y={scaleY + 8}
              dominantBaseline="central"
            >
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
                style={{
                  fill: tok(step),
                  stroke: "rgb(var(--edge))",
                  strokeWidth: 1,
                }}
              />
            ))}
            <text
              className="chart-tick"
              x={rampEnd + 6}
              y={scaleY + 8}
              dominantBaseline="central"
            >
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
            <text
              className="chart-tick"
              x={absentX + swatch + 6}
              y={absentY + 8}
              dominantBaseline="central"
            >
              {absent}
            </text>
          </g>
        </svg>
      ) : (
        <div style={{ height: 200 }} />
      )}
      <ChartTooltip
        content={
          activeSeries && activeAxis
            ? scoreTip(activeAxis, series, activeSeries.id, score)
            : null
        }
      />
    </div>
  );
}

