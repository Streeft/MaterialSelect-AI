"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import type { MapPoint, PropertyMap } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import {
  HIGHLIGHT_COLOR,
  chartFileName,
  classColors,
  downloadPlotImage,
  toClosedRing,
  toXY,
  withAlpha,
} from "@/lib/charts";

// Plotly touches window/document, so it must never render on the server.
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const t = ptBR.map;

interface AshbyMapProps {
  map: PropertyMap;
  highlightIds?: number[];
  showEnvelopes?: boolean;
  showIntervals?: boolean;
  showLabels?: boolean;
}

/** Half-widths of the error bar for one axis, or null when there is nothing to draw. */
function errorBar(
  point: MapPoint,
  axis: "x" | "y",
): { plus: number; minus: number } | null {
  const value = axis === "x" ? point.x : point.y;
  const low = axis === "x" ? point.x_min : point.y_min;
  const high = axis === "x" ? point.x_max : point.y_max;
  // An interval is the stronger statement, so it wins over a symmetric ±.
  if (low !== null && high !== null) {
    return { plus: Math.max(high - value, 0), minus: Math.max(value - low, 0) };
  }
  const uncertainty = axis === "x" ? point.x_uncertainty : point.y_uncertainty;
  if (uncertainty !== null && uncertainty > 0) {
    return { plus: uncertainty, minus: uncertainty };
  }
  return null;
}

function hoverFor(point: MapPoint, map: PropertyMap): string {
  const xUnit = prettyUnit(map.x_axis.unit);
  const yUnit = prettyUnit(map.y_axis.unit);
  const lines = [
    `<b>${point.material_name}</b>`,
    point.class_name,
    `${map.x_axis.property_name}: ${formatNumber(point.x)} ${xUnit}`,
    `${map.y_axis.property_name}: ${formatNumber(point.y)} ${yUnit}`,
  ];
  if (point.x_min !== null && point.x_max !== null) {
    lines.push(
      `${t.interval} X: ${formatNumber(point.x_min)} – ${formatNumber(point.x_max)} ${xUnit}`,
    );
  }
  if (point.y_min !== null && point.y_max !== null) {
    lines.push(
      `${t.interval} Y: ${formatNumber(point.y_min)} – ${formatNumber(point.y_max)} ${yUnit}`,
    );
  }
  if (point.x_uncertainty !== null) {
    lines.push(`${t.uncertainty} X: ±${formatNumber(point.x_uncertainty)} ${xUnit}`);
  }
  if (point.y_uncertainty !== null) {
    lines.push(`${t.uncertainty} Y: ±${formatNumber(point.y_uncertainty)} ${yUnit}`);
  }
  lines.push(
    `${t.quality}: ${ptBR.quality[point.x_quality]} / ${ptBR.quality[point.y_quality]}`,
  );
  if (map.index) {
    lines.push(
      point.index_value === null
        ? `${t.indexValue}: ${point.index_undefined_reason ?? t.undefinedIndex}`
        : `${t.indexValue}: ${formatNumber(point.index_value)}`,
    );
  }
  return lines.join("<br>");
}

/**
 * The Ashby property map.
 *
 * Draws only what the API computed: point coordinates and interval bounds in
 * canonical units, convex-hull envelopes already expressed in the displayed
 * scale, and index lines whose slope and endpoints were derived from the
 * expression on the server.
 */
export function AshbyMap({
  map,
  highlightIds = [],
  showEnvelopes = true,
  showIntervals = true,
  showLabels = false,
}: AshbyMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"png" | "svg" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const colors = useMemo(
    () => classColors(map.points.map((p) => p.class_slug)),
    [map.points],
  );
  const highlighted = useMemo(() => new Set(highlightIds), [highlightIds]);

  const traces = useMemo<Data[]>(() => {
    const result: Data[] = [];

    // 1. Class envelopes, drawn first so points sit on top of them.
    if (showEnvelopes) {
      for (const envelope of map.envelopes) {
        const { xs, ys } = toClosedRing(envelope.polygon);
        if (xs.length < 2) continue; // a single material has no outline to show
        const color = colors[envelope.class_slug] ?? HIGHLIGHT_COLOR;
        result.push({
          x: xs,
          y: ys,
          type: "scatter",
          mode: "lines",
          fill: xs.length > 2 ? "toself" : undefined,
          fillcolor: withAlpha(color, 0.08),
          line: { color, width: 1, dash: "dot" },
          hoverinfo: "skip",
          showlegend: false,
          name: envelope.class_name,
        });
      }
    }

    // 2. One scatter trace per class, so the legend doubles as a class filter.
    const byClass = new Map<string, MapPoint[]>();
    for (const point of map.points) {
      const bucket = byClass.get(point.class_slug);
      if (bucket) bucket.push(point);
      else byClass.set(point.class_slug, [point]);
    }

    for (const [classSlug, members] of Array.from(byClass.entries()).sort()) {
      const color = colors[classSlug] ?? HIGHLIGHT_COLOR;
      const xErrors = members.map((p) => errorBar(p, "x"));
      const yErrors = members.map((p) => errorBar(p, "y"));
      const hasX = showIntervals && xErrors.some(Boolean);
      const hasY = showIntervals && yErrors.some(Boolean);

      result.push({
        x: members.map((p) => p.x),
        y: members.map((p) => p.y),
        text: members.map((p) => p.material_name),
        hovertext: members.map((p) => hoverFor(p, map)),
        hoverinfo: "text",
        type: "scatter",
        mode: showLabels ? "text+markers" : "markers",
        textposition: "top center",
        textfont: { size: 10, color: "#475569" },
        name: members[0]?.class_name ?? classSlug,
        marker: {
          size: members.map((p) => (highlighted.has(p.material_id) ? 16 : 11)),
          color,
          line: {
            width: members.map((p) => (highlighted.has(p.material_id) ? 3 : 1)),
            color: members.map((p) =>
              highlighted.has(p.material_id) ? HIGHLIGHT_COLOR : "#ffffff",
            ),
          },
        },
        error_x: hasX
          ? {
              type: "data",
              symmetric: false,
              array: xErrors.map((e) => e?.plus ?? 0),
              arrayminus: xErrors.map((e) => e?.minus ?? 0),
              color: withAlpha(color, 0.55),
              thickness: 1,
              width: 3,
            }
          : undefined,
        error_y: hasY
          ? {
              type: "data",
              symmetric: false,
              array: yErrors.map((e) => e?.plus ?? 0),
              arrayminus: yErrors.map((e) => e?.minus ?? 0),
              color: withAlpha(color, 0.55),
              thickness: 1,
              width: 3,
            }
          : undefined,
      });
    }

    // 3. Index lines. Slope and endpoints come from the backend untouched.
    if (map.index?.available) {
      map.index.levels.forEach((level, position) => {
        const { xs, ys } = toXY(level.points);
        if (xs.length < 2) return;
        const label = level.material_name
          ? `M = ${formatNumber(level.value)} (${level.material_name})`
          : `M = ${formatNumber(level.value)}`;
        result.push({
          x: xs,
          y: ys,
          type: "scatter",
          mode: "lines",
          name: label,
          line: {
            color: "#0f172a",
            width: 2,
            dash: position === 0 ? "solid" : "dash",
          },
          hovertemplate: `${label}<extra></extra>`,
        });
      });
    }

    return result;
  }, [map, colors, highlighted, showEnvelopes, showIntervals, showLabels]);

  const layout = useMemo<Partial<Layout>>(() => {
    const axisTitle = (
      name: string,
      symbol: string | null,
      unit: string,
    ): string => {
      const pretty = prettyUnit(unit);
      const head = symbol ? `${name}, ${symbol}` : name;
      return pretty ? `${head} [${pretty}]` : head;
    };
    return {
      autosize: true,
      height: 540,
      margin: { l: 80, r: 24, t: 16, b: 60 },
      hovermode: "closest",
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      legend: { orientation: "h", y: -0.18, font: { size: 11 } },
      xaxis: {
        title: {
          text: axisTitle(map.x_axis.property_name, map.x_axis.symbol, map.x_axis.unit),
        },
        type: map.scale,
        gridcolor: "#e2e8f0",
        zeroline: false,
      },
      yaxis: {
        title: {
          text: axisTitle(map.y_axis.property_name, map.y_axis.symbol, map.y_axis.unit),
        },
        type: map.scale,
        gridcolor: "#e2e8f0",
        zeroline: false,
      },
    };
  }, [map]);

  async function handleExport(format: "png" | "svg") {
    setExportError(null);
    setExporting(format);
    try {
      await downloadPlotImage(
        container.current,
        format,
        chartFileName(
          "mapa",
          map.y_axis.property_name,
          map.x_axis.property_name,
          map.scale,
        ),
      );
    } catch {
      setExportError(t.exportError);
    } finally {
      setExporting(null);
    }
  }

  const buttonClass =
    "rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {t.coverage(map.plotted_count, map.considered_count)}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={() => void handleExport("png")}
            disabled={exporting !== null || map.points.length === 0}
          >
            {exporting === "png" ? t.exporting : t.exportPng}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => void handleExport("svg")}
            disabled={exporting !== null || map.points.length === 0}
          >
            {exporting === "svg" ? t.exporting : t.exportSvg}
          </button>
        </div>
      </div>

      {exportError && (
        <p role="alert" className="mb-2 text-xs text-red-600">
          {exportError}
        </p>
      )}

      {map.points.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">{t.empty}</p>
      ) : (
        <div ref={container}>
          <Plot
            data={traces}
            layout={layout}
            config={{ displaylogo: false, responsive: true }}
            style={{ width: "100%" }}
            useResizeHandler
          />
        </div>
      )}
    </div>
  );
}
