"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Layout } from "plotly.js";
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
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  useResolvedTheme,
} from "@/components/ui";
import { ChartToolbar } from "@/components/charts/ChartToolbar";
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
 */
export function PropertyChart({ data, highlightMaterialId }: PropertyChartProps) {
  const [scale, setScale] = useState<Scale>("log");
  const container = useRef<HTMLDivElement>(null);
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
      sizes.push(isThisOne ? 16 : 9);
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
      xaxis: {
        ...paint.layout.xaxis,
        title: { text: `${data.x_property_name} [${prettyUnit(data.x_unit)}]` },
        type: scale,
      },
      yaxis: {
        ...paint.layout.yaxis,
        title: { text: `${data.y_property_name} [${prettyUnit(data.y_unit)}]` },
        type: scale,
      },
    }),
    [paint, data, scale],
  );

  const hasPoints = xs.length > 0;

  return (
    <Card>
      <CardHeader
        headingLevel={2}
        title={ptBR.detail.position}
        description={ptBR.detail.positionHint}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
            <ChartToolbar
              target={container}
              disabled={!hasPoints}
              fileName={chartFileName(
                "posicao",
                data.y_property_name,
                data.x_property_name,
                scale,
              )}
            />
          </div>
        }
      />
      <CardBody className="flex flex-col gap-2">
        {hasPoints ? (
          <div ref={container} role="img" aria-label={t.figureLabel(ptBR.detail.position)}>
            <Plot
              data={[
                {
                  x: xs,
                  y: ys,
                  text: labels,
                  type: "scatter",
                  mode: "markers",
                  marker: { size: sizes, color: colors },
                  hovertemplate: "%{text}<br>%{x}<br>%{y}<extra></extra>",
                },
              ]}
              layout={layout}
              config={{ displaylogo: false, responsive: true, toImageButtonOptions: { format: "png" } }}
              style={{ width: "100%" }}
              useResizeHandler
            />
          </div>
        ) : (
          <EmptyState title={t.empty} />
        )}

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

        <div className="flex flex-col gap-0.5 text-2xs text-ink-subtle">
          {data.excluded_material_ids.length > 0 && (
            <p>{t.excludedNote(data.excluded_material_ids.length)}</p>
          )}
          {scale === "log" && droppedForLog > 0 && <p>{t.logNote}</p>}
        </div>
      </CardBody>
    </Card>
  );
}
