"use client";

import { useState } from "react";
import type { DashboardPropertyStats, HistogramBin } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { ptBR } from "@/lib/i18n";
import { prettyUnit } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { EmptyState } from "@/components/ui";
import { ChartFrame } from "../charts/ChartFrame";
import { ChartTooltip, type TooltipContent } from "../charts/ChartTooltip";
import { FigureData } from "../charts/FigureData";
import { linearTicks, makeScale, tok, useChartWidth, useRovingFocus } from "../charts/figureKit";

const PLOT = 220;
const LEFT = 44;
const TOP = 12;
const BOTTOM = 44;

/** An axis number: three significant digits, pt-BR. Formatting, not arithmetic. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) return value.toExponential(1).replace(".", ",");
  return value.toLocaleString("pt-BR", { maximumSignificantDigits: 3 });
}

/**
 * The histogram of one property over the filtered materials (D-193).
 *
 * Bin edges and counts come from `dashboard_service.property_stats()` —
 * Freedman–Diaconis, equal in log10 when the property allows it — so the
 * columns are drawn at equal width either way (on a log axis equal-in-log bins
 * *are* equal width). The only client arithmetic is pixel scaling.
 */
export function HistogramChart({ stats }: { stats: DashboardPropertyStats }) {
  const [measure, width] = useChartWidth();
  const [active, setActive] = useState<{ index: number; focus: boolean } | null>(null);
  const bins = stats.bins;
  const roving = useRovingFocus(bins.length);
  const unit = prettyUnit(stats.display_unit);
  const withUnit = (v: number) => (unit && unit !== "—" ? `${compact(v)} ${unit}` : compact(v));

  const W = width ?? 0;
  const plotW = Math.max(40, W - LEFT - 8);
  const band = bins.length > 0 ? plotW / bins.length : plotW;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const y = makeScale([0, max], [0, PLOT]);
  const ticks = linearTicks(0, max, 4).filter((t) => Number.isInteger(t));
  const baseline = TOP + PLOT;
  const height = baseline + BOTTOM;
  // Edge labels: first, last, and enough in between to stay legible.
  const every = Math.max(1, Math.ceil(bins.length / Math.max(2, Math.floor(plotW / 70))));

  const activeBin = active ? bins[active.index] : undefined;
  const tip: TooltipContent | null = activeBin
    ? {
        title: d.property.binRange(withUnit(activeBin.lower), withUnit(activeBin.upper)),
        rows: [
          {
            key: "count",
            label: d.property.binCount,
            value: activeBin.count.toLocaleString("pt-BR"),
            color: tok("--accent"),
          },
        ],
      }
    : null;

  return (
    <ChartFrame
      title={`${d.property.histogramTitle} — ${stats.property_name}`}
      description={d.property.histogramHint(stats.log_bins)}
      exportName={chartFileName("painel", "histograma", stats.property_slug)}
      exportDisabled={bins.length === 0}
      empty={bins.length === 0 ? <EmptyState title={d.property.histogramEmpty} /> : undefined}
      table={
        <FigureData<HistogramBin>
          caption={d.property.histogramFigure(stats.property_name)}
          rows={bins}
          rowKey={(b) => `${b.lower}-${b.upper}`}
          rowHeader={{
            header: d.property.bin,
            cell: (b) => d.property.binRange(withUnit(b.lower), withUnit(b.upper)),
          }}
          columns={[
            {
              key: "count",
              header: d.property.binCount,
              numeric: true,
              cell: (b) => b.count.toLocaleString("pt-BR"),
            },
          ]}
        />
      }
    >
      <div ref={measure} className="relative min-w-0">
        {width !== null ? (
          <svg
            data-chart-figure
            role="figure"
            aria-label={ptBR.chart.figureLabel(d.property.histogramFigure(stats.property_name))}
            className="chart-svg"
            width={W}
            height={height}
            viewBox={`0 0 ${W} ${height}`}
            onKeyDown={roving.onKeyDown}
            onMouseLeave={() => setActive(null)}
          >
            <g aria-hidden>
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    className={t === 0 ? "chart-axis" : "chart-grid"}
                    x1={LEFT}
                    x2={LEFT + plotW}
                    y1={baseline - y(t)}
                    y2={baseline - y(t)}
                  />
                  <text className="chart-tick" x={LEFT - 8} y={baseline - y(t)} dominantBaseline="central" textAnchor="end">
                    {t.toLocaleString("pt-BR")}
                  </text>
                </g>
              ))}
              {bins.map((b, i) =>
                i % every === 0 || i === bins.length - 1 ? (
                  <text
                    key={`edge-${i}`}
                    className="chart-tick"
                    x={LEFT + (i === bins.length - 1 && i % every !== 0 ? (i + 1) * band : i * band)}
                    y={baseline + 16}
                    textAnchor="middle"
                  >
                    {compact(i === bins.length - 1 && i % every !== 0 ? b.upper : b.lower)}
                  </text>
                ) : null,
              )}
              <text className="chart-axis-title" x={LEFT + plotW / 2} y={height - 4} textAnchor="middle">
                {unit && unit !== "—" ? `${stats.property_name} (${unit})${stats.log_bins ? " · log" : ""}` : stats.property_name}
              </text>
            </g>
            {bins.map((b, i) => {
              const h = y(b.count);
              const x = LEFT + i * band + 1;
              const w = Math.max(1, band - 2);
              const isActive = active?.index === i;
              return (
                <g
                  key={`${b.lower}-${b.upper}`}
                  ref={roving.register(i)}
                  className="chart-mark"
                  role="img"
                  tabIndex={roving.tabIndexFor(i)}
                  aria-label={`${d.property.binRange(withUnit(b.lower), withUnit(b.upper))}: ${b.count.toLocaleString("pt-BR")}`}
                  onMouseEnter={() => setActive({ index: i, focus: false })}
                  onFocus={() => {
                    roving.setActive(i);
                    setActive({ index: i, focus: true });
                  }}
                  onBlur={() => setActive(null)}
                >
                  {/* The whole column is the hover target, not only the ink. */}
                  <rect x={LEFT + i * band} y={TOP} width={band} height={PLOT} fill="transparent" />
                  {b.count > 0 ? (
                    <path
                      className="chart-bar-seg"
                      data-active={isActive ? "true" : "false"}
                      d={`M${x},${baseline}V${baseline - h + Math.min(4, h, w / 2)}Q${x},${baseline - h} ${x + Math.min(4, w / 2)},${baseline - h}H${x + w - Math.min(4, w / 2)}Q${x + w},${baseline - h} ${x + w},${baseline - h + Math.min(4, h, w / 2)}V${baseline}Z`}
                      style={{ fill: tok("--accent") }}
                    />
                  ) : null}
                  {active?.focus && isActive ? (
                    <rect className="chart-focus-ring" x={x} y={baseline - Math.max(h, 2)} width={w} height={Math.max(h, 2)} />
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height }} />
        )}
        <ChartTooltip content={tip} />
      </div>
    </ChartFrame>
  );
}
