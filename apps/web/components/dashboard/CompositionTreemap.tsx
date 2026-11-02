"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardComposition, TreemapCell } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { classVisual } from "@/lib/design/palette";
import { catalogueHref } from "@/lib/dashboardState";
import { EmptyState } from "@/components/ui";
import { ChartFrame } from "../charts/ChartFrame";
import { ChartLegend } from "../charts/ChartLegend";
import { ChartTooltip, type TooltipContent } from "../charts/ChartTooltip";
import { FigureData, type FigureColumn } from "../charts/FigureData";
import { truncate, useChartWidth, useRovingFocus } from "../charts/figureKit";

const GAP = 2;

/**
 * Materials per class and subclass as a two-level treemap (D-193).
 *
 * Every rectangle comes from `dashboard_service.composition()` (squarified in
 * the backend, ADR 0004); the client only scales the backend's box to the card
 * width. Colour is the class's Okabe–Ito seat (`classVisual`), so a class has
 * the same hue here as on every map; subclasses are the class hue at a lighter
 * fill, separated by a 2 px surface gap. Identity is never colour alone: each
 * cell is labelled when it fits, the legend names the classes, the tooltip and
 * the table name everything.
 *
 * A subclass cell is a link to the catalogue filtered on that class and
 * subclass; the class itself is reached from the legend's table and the
 * tooltip's title.
 */
export function CompositionTreemap({ data }: { data: DashboardComposition }) {
  const router = useRouter();
  const [measure, width] = useChartWidth();
  const [active, setActive] = useState<{ key: string; focus: boolean } | null>(null);

  const classes = useMemo(() => data.cells.filter((c) => c.depth === 0), [data.cells]);
  const leaves = useMemo(() => data.cells.filter((c) => c.depth === 1 && c.count > 0), [data.cells]);
  const roving = useRovingFocus(leaves.length);
  const total = classes.reduce((sum, c) => sum + c.count, 0);

  const W = width ?? 0;
  const scale = W > 0 ? W / data.width : 0;
  const H = data.height * scale;

  const label = (cell: TreemapCell) => cell.subclass ?? d.composition.unnamed;
  const share = (cell: TreemapCell) => (cell.share_pct === null ? "" : ` · ${formatPercent(cell.share_pct)}`);
  const open = (cell: TreemapCell) => router.push(catalogueHref(cell.class_slug, cell.subclass));

  const activeCell = active ? leaves.find((c) => c.key === active.key) : undefined;
  const parent = activeCell ? classes.find((c) => c.class_slug === activeCell.class_slug) : undefined;
  const tip: TooltipContent | null = activeCell
    ? {
        title: label(activeCell),
        rows: [
          {
            key: "class",
            label: d.composition.columnClass,
            value: `${activeCell.class_name}${parent ? ` (${parent.count.toLocaleString("pt-BR")})` : ""}`,
            color: classVisual(activeCell.class_slug).color,
            symbol: classVisual(activeCell.class_slug).symbol,
          },
          {
            key: "count",
            label: d.composition.columnMaterials,
            value: `${activeCell.count.toLocaleString("pt-BR")}${share(activeCell)}`,
          },
        ],
        note: d.actions.catalogue,
      }
    : null;

  const columns: FigureColumn<TreemapCell>[] = [
    { key: "subclass", header: d.composition.columnSubclass, cell: label },
    {
      key: "count",
      header: d.composition.columnMaterials,
      numeric: true,
      cell: (c) => c.count.toLocaleString("pt-BR"),
    },
    {
      key: "share",
      header: d.composition.columnShare,
      numeric: true,
      cell: (c) => (c.share_pct === null ? null : formatPercent(c.share_pct)),
    },
  ];

  return (
    <ChartFrame
      title={d.composition.title}
      description={d.composition.hint}
      exportName={chartFileName("painel", "composicao")}
      exportDisabled={total === 0}
      empty={total === 0 ? <EmptyState title={d.composition.empty} /> : undefined}
      table={
        <FigureData
          caption={d.composition.figure}
          rows={leaves}
          rowKey={(c) => c.key}
          rowHeader={{ header: d.composition.columnClass, cell: (c) => c.class_name }}
          columns={columns}
        />
      }
    >
      <div ref={measure} className="relative min-w-0">
        {width !== null ? (
          <svg
            data-chart-figure
            role="figure"
            aria-label={ptBR.chart.figureLabel(d.composition.figure)}
            className="chart-svg"
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            onKeyDown={roving.onKeyDown}
            onMouseLeave={() => setActive(null)}
          >
            {classes.map((c) => (
              <rect
                key={c.key}
                aria-hidden
                x={c.x0 * scale}
                y={c.y0 * scale}
                width={Math.max(0, (c.x1 - c.x0) * scale)}
                height={Math.max(0, (c.y1 - c.y0) * scale)}
                rx={4}
                style={{ fill: classVisual(c.class_slug).color }}
              />
            ))}
            {leaves.map((c, i) => {
              const x = c.x0 * scale + GAP / 2;
              const y = c.y0 * scale + GAP / 2;
              const w = Math.max(0, (c.x1 - c.x0) * scale - GAP);
              const h = Math.max(0, (c.y1 - c.y0) * scale - GAP);
              const isActive = active?.key === c.key;
              const fits = w > 64 && h > 34;
              return (
                <g
                  key={c.key}
                  ref={roving.register(i)}
                  className="chart-mark"
                  role="link"
                  tabIndex={roving.tabIndexFor(i)}
                  aria-label={`${d.composition.open(`${c.class_name}, ${label(c)}`)} — ${c.count.toLocaleString("pt-BR")}${share(c)}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => open(c)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open(c);
                    }
                  }}
                  onMouseEnter={() => setActive({ key: c.key, focus: false })}
                  onFocus={() => {
                    roving.setActive(i);
                    setActive({ key: c.key, focus: true });
                  }}
                  onBlur={() => setActive(null)}
                >
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={3}
                    style={{
                      fill: "rgb(var(--surface-raised))",
                      opacity: isActive ? 0.55 : 0.78,
                      stroke: isActive ? "rgb(var(--ink))" : "none",
                      strokeWidth: 2,
                    }}
                  />
                  {fits ? (
                    <>
                      <text className="chart-label" x={x + 6} y={y + 15} aria-hidden>
                        {truncate(label(c), Math.floor((w - 10) / 6.6))}
                      </text>
                      <text className="chart-value" x={x + 6} y={y + 29} aria-hidden>
                        {c.count.toLocaleString("pt-BR")}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height: 280 }} />
        )}
        <ChartTooltip content={tip} />
        <ChartLegend
          items={classes.map((c) => ({
            key: c.class_slug,
            label: `${c.class_name} (${c.count.toLocaleString("pt-BR")})`,
            color: classVisual(c.class_slug).color,
            symbol: classVisual(c.class_slug).symbol,
          }))}
        />
      </div>
    </ChartFrame>
  );
}
