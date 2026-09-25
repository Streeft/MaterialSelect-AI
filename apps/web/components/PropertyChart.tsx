"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Layout, LayoutAxis } from "plotly.js";
import type { ChartData } from "@/lib/types";
import type { ChartPoint } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { chartFileName, escapeHover } from "@/lib/charts";
import { chartTheme } from "@/lib/design/palette";
import {
  Badge,
  ButtonGroup,
  ButtonGroupItem,
  EmptyState,
  useResolvedTheme,
} from "@/components/ui";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { IconChartScatter } from "@/components/ui/icons";
import { ChartLegend } from "@/components/charts/ChartLegend";
import { ChartTooltip, type TooltipContent } from "@/components/charts/ChartTooltip";
import { FigureData, type FigureColumn } from "@/components/charts/FigureData";

// Plotly touches the DOM/window, so it must not render on the server.
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const t = ptBR.chart;

type Scale = "linear" | "log";

interface PropertyChartProps {
  data: ChartData;
  highlightMaterialId?: number;
}

/**
 * Where one material sits among the others.
 *
 * Two properties, canonical values, one point per material, and the material
 * being read drawn larger and in the highlight colour. Under log scale,
 * non-positive values are dropped — they are undefined on a log axis — and the
 * omission is disclosed rather than silently shrinking the population.
 *
 * Plotly still draws it (log axes, zoom), in MSDS's `ScatterMap` clothing
 * (D-80): the chart card, the app's face, recessive grid, markers in a thin dark
 * ring and a written legend for the two kinds of point. The points carry no
 * class colour because `ChartPoint` carries no class slug, and a colour guessed
 * from the class *name* would disagree with every other figure's seat.
 */
function titled(axis: Partial<LayoutAxis> | undefined, text: string): Partial<LayoutAxis> {
  const base = axis?.title;
  return { ...axis, title: { ...(typeof base === "object" ? base : {}), text } };
}

export function PropertyChart({ data, highlightMaterialId }: PropertyChartProps) {
  const [scale, setScale] = useState<Scale>("log");
  const theme = useResolvedTheme();
  const paint = useMemo(() => chartTheme(theme), [theme]);

  const { plotted, xs, ys, labels, colors, sizes, droppedForLog } = useMemo(() => {
    const plotted: ChartPoint[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    const labels: string[] = [];
    const colors: string[] = [];
    const sizes: number[] = [];
    let droppedForLog = 0;

    for (const point of data.points) {
      if (scale === "log" && (point.x <= 0 || point.y <= 0)) {
        droppedForLog += 1;
        continue;
      }
      const isThisOne = point.material_id === highlightMaterialId;
      plotted.push(point);
      xs.push(point.x);
      ys.push(point.y);
      labels.push(escapeHover(`${point.material_name} (${point.class_name})`));
      colors.push(isThisOne ? paint.highlight : paint.label);
      // Size as well as colour: the highlight has to survive a greyscale print.
      sizes.push(isThisOne ? 15 : 9);
    }
    return { plotted, xs, ys, labels, colors, sizes, droppedForLog };
  }, [data, scale, highlightMaterialId, paint]);

  // The same columns the axes are titled with, so the table reads as the figure.
  const columns = useMemo<FigureColumn<ChartPoint>[]>(
    () => [
      { key: "class", header: ptBR.chart.columnClass, cell: (point) => point.class_name },
      {
        key: "x",
        header: `${data.x_property_name} [${prettyUnit(data.x_unit)}]`,
        numeric: true,
        cell: (point) => formatNumber(point.x),
      },
      {
        key: "y",
        header: `${data.y_property_name} [${prettyUnit(data.y_unit)}]`,
        numeric: true,
        cell: (point) => formatNumber(point.y),
      },
    ],
    [data],
  );

  const layout = useMemo<Partial<Layout>>(
    () => ({
      ...paint.layout,
      autosize: true,
      height: 380,
      margin: { l: 70, r: 20, t: 10, b: 55 },
      showlegend: false,
      uirevision: `${data.x_property_slug}|${data.y_property_slug}|${scale}`,
      xaxis: {
        ...titled(paint.layout.xaxis, `${data.x_property_name} [${prettyUnit(data.x_unit)}]`),
        type: scale,
      },
      yaxis: {
        ...titled(paint.layout.yaxis, `${data.y_property_name} [${prettyUnit(data.y_unit)}]`),
        type: scale,
      },
    }),
    [paint, data, scale],
  );

  const hasPoints = xs.length > 0;

  // D-95: the app's own readout instead of Plotly's hover label.
  const [tip, setTip] = useState<TooltipContent | null>(null);
  const handleHover = (event: { points?: { customdata?: unknown }[] }) => {
    const index = event.points?.[0]?.customdata;
    const point = typeof index === "number" ? plotted[index] : undefined;
    if (!point) return setTip(null);
    const isThisOne = point.material_id === highlightMaterialId;
    setTip({
      title: point.material_name,
      rows: [
        {
          key: "class",
          label: isThisOne ? `${point.class_name} · ${t.thisMaterial}` : point.class_name,
          value: "",
          color: isThisOne ? paint.highlight : paint.label,
          emphasis: isThisOne,
        },
        { key: "x", label: data.x_property_name, value: `${formatNumber(point.x)} ${prettyUnit(data.x_unit)}`.trim() },
        { key: "y", label: data.y_property_name, value: `${formatNumber(point.y)} ${prettyUnit(data.y_unit)}`.trim() },
      ],
    });
  };

  return (
    <ChartFrame
      figureIcon={<IconChartScatter />}
      title={ptBR.detail.position}
      description={ptBR.detail.positionHint}
      exportName={chartFileName("posicao", data.y_property_name, data.x_property_name, scale)}
      exportDisabled={!hasPoints}
      controls={
        <ButtonGroup label={t.scale}>
          {(["linear", "log"] as Scale[]).map((s) => (
            <ButtonGroupItem
              key={s}
              selected={scale === s}
              label={s === "linear" ? t.linear : t.log}
              onClick={() => setScale(s)}
            />
          ))}
        </ButtonGroup>
      }
      empty={hasPoints ? undefined : <EmptyState title={t.empty} />}
      table={
        <FigureData
          caption={ptBR.detail.position}
          rows={plotted}
          rowKey={(point) => point.material_id}
          rowHeader={{
            header: ptBR.compare.columnMaterial,
            cell: (point) => (
              <span className="flex flex-wrap items-center gap-1.5">
                {point.material_name}
                {/* The figure marks this one by colour *and* size; in the table
                    it has to be a word, or the distinction is lost entirely. */}
                {point.material_id === highlightMaterialId ? (
                  <Badge tone="brand">{t.thisMaterial}</Badge>
                ) : null}
              </span>
            ),
          }}
          columns={columns}
        />
      }
      footer={
        data.excluded_material_ids.length > 0 || (scale === "log" && droppedForLog > 0) ? (
          <div className="mt-2 flex flex-col gap-0.5 text-2xs text-ink-subtle">
            {data.excluded_material_ids.length > 0 && (
              <p>{t.excludedNote(data.excluded_material_ids.length)}</p>
            )}
            {scale === "log" && droppedForLog > 0 && <p>{t.logNote}</p>}
          </div>
        ) : null
      }
    >
      <div className="chart-plotly relative" role="img" aria-label={t.figureLabel(ptBR.detail.position)}>
        <Plot
          data={[
            {
              x: xs,
              y: ys,
              text: labels,
              type: "scatter",
              mode: "markers",
              marker: {
                size: sizes,
                color: colors,
                line: { width: 1, color: paint.markerEdge },
              },
              customdata: plotted.map((_, i) => i),
              hoverinfo: "none",
            },
          ]}
          layout={layout}
          config={{
            displaylogo: false,
            responsive: true,
            // Export is the card's (with title and legend); there is no region
            // to select on a material sheet.
            modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d"],
          }}
          style={{ width: "100%" }}
          useResizeHandler
          onHover={handleHover as unknown as (event: unknown) => void}
          onUnhover={() => setTip(null)}
        />
        <ChartTooltip content={tip} />
      </div>
      <ChartLegend
        items={[
          ...(plotted.some((point) => point.material_id === highlightMaterialId)
            ? [{ key: "this", label: t.thisMaterial, color: paint.highlight, symbol: "circle" as const }]
            : []),
          { key: "others", label: t.otherMaterials, color: paint.label, symbol: "circle" as const },
        ]}
      />
    </ChartFrame>
  );
}
