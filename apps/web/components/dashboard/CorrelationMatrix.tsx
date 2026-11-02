"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CorrelationCell, DashboardCorrelation } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { ptBR } from "@/lib/i18n";
import { formatScore } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { mapHref } from "@/lib/dashboardState";
import { EmptyState } from "@/components/ui";
import { MathTex } from "@/components/expression/MathTex";
import { ChartFrame } from "../charts/ChartFrame";
import { ChartTooltip, type TooltipContent } from "../charts/ChartTooltip";
import { FigureData } from "../charts/FigureData";
import { tok, truncate, useChartWidth, useRovingFocus } from "../charts/figureKit";

/**
 * Diverging fill: the sign picks the hue, |ρ| the opacity over the panel
 * surface, so ρ = 0 *is* the neutral midpoint (dataviz: two hues and a gray
 * centre, never a hue at zero). The two poles are `--diverge-pos/neg`, validated
 * for CVD in both themes (D-193). The number is the backend's; only its
 * magnitude becomes an alpha here.
 */
function fill(rho: number): string {
  const alpha = Math.min(1, Math.max(0.06, Math.abs(rho)));
  return tok(rho >= 0 ? "--diverge-pos" : "--diverge-neg", alpha);
}

const rhoText = (rho: number) => (rho > 0 ? "+" : rho < 0 ? "−" : "") + formatScore(Math.abs(rho));

/**
 * Spearman's ρ between every pair of the chosen properties (D-193) — computed
 * by `dashboard_service.correlation()`, pairwise-complete; a pair with too few
 * materials is hatched and says "dados insuficientes", never a 0.
 *
 * Clicking (or Enter on) an off-diagonal cell opens that pair on the Ashby map,
 * where the correlation can be seen material by material.
 */
export function CorrelationMatrix({ data }: { data: DashboardCorrelation }) {
  const router = useRouter();
  const [measure, width] = useChartWidth();
  const [active, setActive] = useState<{ x: string; y: string; focus: boolean } | null>(null);
  const hatchId = `${useId().replace(/:/g, "")}-hatch`;
  const props = data.properties;
  const n = props.length;
  const roving = useRovingFocus(n * n, n);
  const byPair = useMemo(() => new Map(data.cells.map((c) => [`${c.x}|${c.y}`, c])), [data.cells]);
  const names = useMemo(() => new Map(props.map((p) => [p.slug, p.name])), [props]);

  const W = width ?? 0;
  const labelWidth = Math.min(170, Math.max(84, W * 0.26));
  const gap = 2;
  const cell = Math.max(14, Math.min(44, Math.floor((W - labelWidth - 12) / Math.max(1, n)) - gap));
  const gridX = labelWidth + 8;
  const gridTop = 8;
  const gridW = n * (cell + gap);
  const legendY = gridTop + gridW + 22;
  const height = legendY + 30;
  const svgWidth = Math.max(W, gridX + gridW + 8);
  const labelChars = Math.floor(labelWidth / 6.6);
  const showNumbers = cell >= 34;

  const open = (c: CorrelationCell) => {
    if (c.x !== c.y) router.push(mapHref(c.x, c.y));
  };

  const activeCell = active ? byPair.get(`${active.x}|${active.y}`) : undefined;
  const tip: TooltipContent | null = activeCell
    ? {
        title: `${names.get(activeCell.y) ?? activeCell.y} × ${names.get(activeCell.x) ?? activeCell.x}`,
        rows: [
          {
            key: "rho",
            label: "ρ",
            value: activeCell.rho === null ? d.correlation.noRho : `${rhoText(activeCell.rho)} (${d.correlation.strength(activeCell.rho)})`,
            color: activeCell.rho === null ? undefined : fill(activeCell.rho >= 0 ? 1 : -1),
          },
          { key: "pairs", label: d.correlation.columnPairs, value: d.correlation.pairs(activeCell.pairs) },
        ],
        note:
          activeCell.x !== activeCell.y
            ? d.actions.openMapPair(names.get(activeCell.x) ?? "", names.get(activeCell.y) ?? "")
            : undefined,
      }
    : null;

  const upper = data.cells.filter((c) => props.findIndex((p) => p.slug === c.x) < props.findIndex((p) => p.slug === c.y));

  return (
    <ChartFrame
      title={d.correlation.title}
      description={d.correlation.hint(data.min_pairs)}
      exportName={chartFileName("painel", "correlacao")}
      exportDisabled={n < 2}
      empty={n < 2 ? <EmptyState title={d.correlation.empty} /> : undefined}
      table={
        <FigureData<CorrelationCell>
          caption={d.correlation.figure}
          rows={upper}
          rowKey={(c) => `${c.x}|${c.y}`}
          rowHeader={{ header: d.correlation.columnA, cell: (c) => names.get(c.x) ?? c.x }}
          columns={[
            { key: "b", header: d.correlation.columnB, cell: (c) => names.get(c.y) ?? c.y },
            {
              key: "rho",
              header: d.correlation.columnRho,
              numeric: true,
              cell: (c) => (c.rho === null ? d.correlation.noRho : rhoText(c.rho)),
            },
            {
              key: "pairs",
              header: d.correlation.columnPairs,
              numeric: true,
              cell: (c) => c.pairs.toLocaleString("pt-BR"),
            },
          ]}
        />
      }
      footer={
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-caption text-ink-muted" aria-label={d.correlation.pick}>
          {props.map((p) => (
            <li key={p.slug} className="flex items-center gap-1">
              {p.symbol_latex ? <MathTex latex={p.symbol_latex} label="" /> : null}
              <span>{p.name}</span>
            </li>
          ))}
        </ul>
      }
    >
      <div ref={measure} className="relative min-w-0 overflow-x-auto">
        {width !== null ? (
          <svg
            data-chart-figure
            role="figure"
            aria-label={ptBR.chart.figureLabel(d.correlation.figure)}
            className="chart-svg"
            width={svgWidth}
            height={height}
            viewBox={`0 0 ${svgWidth} ${height}`}
            onKeyDown={roving.onKeyDown}
            onMouseLeave={() => setActive(null)}
          >
            <defs>
              <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "rgb(var(--quality-ausente) / 0.45)", strokeWidth: 2 }} />
              </pattern>
            </defs>
            {props.map((p, ri) => (
              <text
                key={`row-${p.slug}`}
                className="chart-label"
                data-active={active?.y === p.slug ? "true" : "false"}
                x={labelWidth}
                y={gridTop + ri * (cell + gap) + cell / 2}
                dominantBaseline="central"
                textAnchor="end"
                aria-hidden
              >
                {truncate(p.name, labelChars)}
                {p.name.length > labelChars ? <title>{p.name}</title> : null}
              </text>
            ))}
            {props.map((py, ri) =>
              props.map((px, ci) => {
                const c = byPair.get(`${px.slug}|${py.slug}`);
                if (!c) return null;
                const index = ri * n + ci;
                const x = gridX + ci * (cell + gap);
                const y = gridTop + ri * (cell + gap);
                const isActive = active?.x === c.x && active.y === c.y;
                const value = c.rho === null ? d.correlation.noRho : rhoText(c.rho);
                return (
                  <g
                    key={`${c.x}|${c.y}`}
                    ref={roving.register(index)}
                    className="chart-mark"
                    role={c.x !== c.y ? "link" : "img"}
                    tabIndex={roving.tabIndexFor(index)}
                    aria-label={d.correlation.cellAria(py.name, px.name, value, d.correlation.pairs(c.pairs))}
                    style={c.x !== c.y ? { cursor: "pointer" } : undefined}
                    onClick={() => open(c)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        open(c);
                      }
                    }}
                    onMouseEnter={() => setActive({ x: c.x, y: c.y, focus: false })}
                    onFocus={() => {
                      roving.setActive(index);
                      setActive({ x: c.x, y: c.y, focus: true });
                    }}
                    onBlur={() => setActive(null)}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={cell}
                      height={cell}
                      rx={3}
                      style={
                        c.rho === null
                          ? {
                              fill: `url(#${hatchId})`,
                              stroke: "rgb(var(--quality-ausente))",
                              strokeDasharray: "3 2",
                              strokeWidth: 1,
                            }
                          : {
                              fill: fill(c.rho),
                              stroke: isActive ? "rgb(var(--ink))" : "rgb(var(--edge))",
                              strokeWidth: isActive ? 2 : 1,
                            }
                      }
                    />
                    {showNumbers && c.rho !== null ? (
                      <text
                        className="chart-tick"
                        x={x + cell / 2}
                        y={y + cell / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        aria-hidden
                        style={{ fill: Math.abs(c.rho) >= 0.6 ? "rgb(var(--ink-inverted))" : "rgb(var(--ink))" }}
                      >
                        {formatScore(c.rho, 1)}
                      </text>
                    ) : null}
                  </g>
                );
              }),
            )}
            {/* Scale: −1 [neg ramp] 0 [pos ramp] +1 · hatch "Sem ρ". */}
            <g aria-hidden>
              <text className="chart-tick" x={gridX} y={legendY} dominantBaseline="central">
                {d.correlation.legendNeg}
              </text>
              {[-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                <rect
                  key={v}
                  x={gridX + 78 + i * 16}
                  y={legendY - 7}
                  width={14}
                  height={14}
                  rx={2}
                  style={{ fill: v === 0 ? "rgb(var(--surface-raised))" : fill(v), stroke: "rgb(var(--edge))", strokeWidth: 1 }}
                />
              ))}
              <text className="chart-tick" x={gridX + 78 + 9 * 16 + 6} y={legendY} dominantBaseline="central">
                {d.correlation.legendPos}
              </text>
            </g>
          </svg>
        ) : (
          <div style={{ height: 320 }} />
        )}
        <ChartTooltip content={tip} />
      </div>
    </ChartFrame>
  );
}
