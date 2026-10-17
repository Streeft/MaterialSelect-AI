"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import type { RagoneAxis, RagonePoint, RagoneResult } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { chartTheme } from "@/lib/design/palette";
import { EmptyState, Alert, useResolvedTheme } from "@/components/ui";
import { IconChartScatter } from "@/components/ui/icons";
import { logAxisTicks, titled } from "./AshbyMap";
import { ChartFrame } from "./ChartFrame";
import { ChartTooltip, type TooltipContent } from "./ChartTooltip";
import { FigureData, type FigureColumn } from "./FigureData";

// Plotly touches window/document, so it must never render on the server.
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const t = ptBR.battery.ragone;

/** `Name [unit]` — the axis title, and the header of its table column. */
function axisTitle(axis: RagoneAxis): string {
  const unit = prettyUnit(axis.unit);
  return unit ? `${axis.label} [${unit}]` : axis.label;
}

/**
 * The Ragone plane of the battery chemistries (D-143).
 *
 * Draws only what the API sent: the catalogue's own points and the iso-time
 * lines (E = P·t) the backend computed in data coordinates (ADR 0004) — nothing
 * is derived here. The power axis carries its caveat in its title and the note
 * below the figure: the catalogue does not say whether a chemistry's power is
 * peak or continuous, and the figure does not guess.
 *
 * It is a component of its own rather than an `AshbyMap`: the map's contract
 * needs a material, a class and `is_demo` per point, and forging those for nine
 * cell chemistries would be worse than a small figure. It draws with the
 * `scatter` trace already registered in `lib/plotly-custom.ts`.
 */
export function RagoneChart({ data, headingLevel = 2 }: { data: RagoneResult; headingLevel?: 2 | 3 | 4 }) {
  const theme = useResolvedTheme();
  const paint = useMemo(() => chartTheme(theme), [theme]);
  const [tip, setTip] = useState<TooltipContent | null>(null);

  const { x_axis: xAxis, y_axis: yAxis } = data;
  const hasFigure = data.points.length > 0 && xAxis !== null && yAxis !== null;

  const traces = useMemo<Data[]>(() => {
    const result: Data[] = [];
    // 1. Iso-time lines first, so the chemistries sit on top of them.
    for (const line of data.iso_time) {
      if (line.points.length < 2) continue;
      result.push({
        x: line.points.map((p) => p.x),
        y: line.points.map((p) => p.y),
        type: "scatter",
        mode: "lines",
        name: `${t.isoTimeNote} ${line.label}`,
        showlegend: false,
        line: { color: paint.label, width: 1, dash: "dot" },
        hoverinfo: "skip",
      });
    }
    // 2. The time written at the end of each line, so no legend is needed.
    const ends = data.iso_time.filter((line) => line.points.length >= 2);
    if (ends.length > 0) {
      result.push({
        x: ends.map((line) => line.points[line.points.length - 1]!.x),
        y: ends.map((line) => line.points[line.points.length - 1]!.y),
        text: ends.map((line) => line.label),
        type: "scatter",
        mode: "text",
        textposition: "top left",
        textfont: { size: 10, color: paint.label },
        showlegend: false,
        hoverinfo: "skip",
      });
    }
    // 3. The chemistries: the catalogue's values, named on the figure.
    result.push({
      x: data.points.map((p) => p.specific_energy),
      y: data.points.map((p) => p.specific_power),
      text: data.points.map((p) => p.name),
      customdata: data.points.map((_, index) => index),
      type: "scatter",
      mode: "text+markers",
      textposition: "top center",
      textfont: { size: 11, color: paint.ink },
      hoverinfo: "none",
      showlegend: false,
      marker: {
        size: 12,
        color: paint.accent,
        symbol: "circle",
        line: { width: 2, color: paint.surface },
      },
    });
    return result;
  }, [data, paint]);

  const layout = useMemo<Partial<Layout>>(() => {
    const base = paint.layout;
    const tickfont = { ...base.xaxis?.tickfont, family: paint.monoFamily, size: 10 };
    return {
      ...base,
      // pt-BR (D-30): decimal comma, thousands point.
      separators: ",.",
      autosize: true,
      height: 480,
      margin: { l: 76, r: 24, t: 16, b: 56 },
      hoverlabel: {
        bgcolor: paint.tooltipBg,
        bordercolor: paint.tooltipBg,
        font: { color: paint.tooltipInk, family: base.font?.family, size: 12 },
      },
      hovermode: "closest",
      dragmode: "zoom",
      showlegend: false,
      xaxis: xAxis
        ? {
            ...titled(base.xaxis, axisTitle(xAxis)),
            type: "log",
            // The backend's box: the iso-time lines were clipped to it.
            range: [Math.log10(xAxis.min_value), Math.log10(xAxis.max_value)],
            zeroline: false,
            tickfont,
            ...logAxisTicks(xAxis.min_value, xAxis.max_value),
          }
        : base.xaxis,
      yaxis: yAxis
        ? {
            ...titled(base.yaxis, axisTitle(yAxis)),
            type: "log",
            range: [Math.log10(yAxis.min_value), Math.log10(yAxis.max_value)],
            zeroline: false,
            tickfont,
            ...logAxisTicks(yAxis.min_value, yAxis.max_value),
          }
        : base.yaxis,
    };
  }, [paint, xAxis, yAxis]);

  const handleHover = (event: { points?: { customdata?: unknown }[] }) => {
    const index = event.points?.[0]?.customdata;
    const point = typeof index === "number" ? data.points[index] : undefined;
    if (!point) return setTip(null);
    setTip({
      title: point.name,
      rows: [
        {
          key: "energy",
          label: t.tooltipEnergy,
          value: `${formatNumber(point.specific_energy)} Wh/kg`,
          color: paint.accent,
          symbol: "circle",
        },
        {
          key: "power",
          label: t.tooltipPower,
          value: `${formatNumber(point.specific_power)} W/kg`,
          color: paint.accent,
          symbol: "circle",
        },
      ],
      note: point.citation ?? t.noSource,
    });
  };

  const columns = useMemo<FigureColumn<RagonePoint>[]>(
    () => [
      {
        key: "energy",
        header: xAxis ? axisTitle(xAxis) : t.tooltipEnergy,
        numeric: true,
        cell: (point) => formatNumber(point.specific_energy),
      },
      {
        key: "power",
        header: yAxis ? axisTitle(yAxis) : t.tooltipPower,
        numeric: true,
        cell: (point) => formatNumber(point.specific_power),
      },
      {
        key: "source",
        header: t.columnSource,
        // Absence is written out (D-24), never a dash or a blank cell.
        cell: (point) => point.citation ?? point.source ?? t.noSource,
      },
    ],
    [xAxis, yAxis],
  );

  return (
    <ChartFrame
      figureIcon={<IconChartScatter />}
      eyebrow={t.figure}
      title={t.title}
      description={t.description}
      headingLevel={headingLevel}
      exportName={chartFileName("ragone", "baterias")}
      exportDisabled={!hasFigure}
      empty={hasFigure ? undefined : <EmptyState title={t.empty} />}
      table={
        <FigureData
          caption={t.tableCaption}
          rows={data.points}
          rowKey={(point) => point.slug}
          rowHeader={{ header: t.columnChemistry, cell: (point) => point.name }}
          columns={columns}
        />
      }
      footer={
        <div className="flex flex-col gap-3">
          <p className="text-support text-ink-muted">{data.power_basis_note}</p>
          {data.excluded.length > 0 ? (
            <Alert tone="warning" title={t.excludedTitle}>
              <ul className="list-disc pl-5">
                {data.excluded.map((item) => (
                  <li key={item.slug}>
                    <strong>{item.name}</strong>: {item.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
        </div>
      }
    >
      {/* `role="img"` collapses Plotly's nodes into one object for assistive
          technology; what replaces them is the data table (D-31). */}
      <div className="chart-plotly relative" role="img" aria-label={ptBR.chart.figureLabel(t.figure)}>
        <Plot
          data={traces}
          layout={layout}
          config={{
            displaylogo: false,
            responsive: true,
            modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d"],
          }}
          onHover={handleHover as unknown as (event: unknown) => void}
          onUnhover={() => setTip(null)}
          style={{ width: "100%" }}
          useResizeHandler
        />
        <ChartTooltip content={tip} />
      </div>
    </ChartFrame>
  );
}
