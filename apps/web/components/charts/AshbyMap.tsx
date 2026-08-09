"use client";

import { useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import type { MapPoint, PropertyMap } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { chartFileName, escapeHover, toClosedRing, toXY, withAlpha } from "@/lib/charts";
import { chartTheme, classVisual } from "@/lib/design/palette";
import { Card, CardBody, CardHeader, EmptyState, useResolvedTheme } from "@/components/ui";
import { ChartToolbar } from "./ChartToolbar";

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
  // Names and property labels are catalogue/import data: escape before they
  // enter Plotly's rich-text pipeline.
  const lines = [
    `<b>${escapeHover(point.material_name)}</b>`,
    escapeHover(point.class_name),
    `${escapeHover(map.x_axis.property_name)}: ${formatNumber(point.x)} ${xUnit}`,
    `${escapeHover(map.y_axis.property_name)}: ${formatNumber(point.y)} ${yUnit}`,
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
        ? `${t.indexValue}: ${escapeHover(point.index_undefined_reason ?? t.undefinedIndex)}`
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
 *
 * Colours, marker shapes and dashes come from the design tokens, so the figure
 * follows the theme instead of staying white inside a dark page — and so a class
 * keeps the same identity here, in the comparator and in `/estilo`.
 */
export function AshbyMap({
  map,
  highlightIds = [],
  showEnvelopes = true,
  showIntervals = true,
  showLabels = false,
}: AshbyMapProps) {
  const container = useRef<HTMLDivElement>(null);
  // Colours come from the tokens of whichever theme is on the document, so the
  // figure has to be rebuilt when the reader switches — not only recoloured.
  const theme = useResolvedTheme();
  const paint = useMemo(() => chartTheme(theme), [theme]);
  const highlighted = useMemo(() => new Set(highlightIds), [highlightIds]);

  const traces = useMemo<Data[]>(() => {
    const result: Data[] = [];

    // 1. Class envelopes, drawn first so points sit on top of them.
    if (showEnvelopes) {
      for (const envelope of map.envelopes) {
        const { xs, ys } = toClosedRing(envelope.polygon);
        if (xs.length < 2) continue; // a single material has no outline to show
        const visual = classVisual(envelope.class_slug);
        result.push({
          x: xs,
          y: ys,
          type: "scatter",
          mode: "lines",
          fill: xs.length > 2 ? "toself" : undefined,
          fillcolor: withAlpha(visual.color, 0.08),
          // The dash is the class's, not a generic dot: on a monochrome
          // printout it is the only thing left telling two envelopes apart.
          line: { color: visual.color, width: 1, dash: visual.dash },
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
      const visual = classVisual(classSlug);
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
        textfont: { size: 10, color: paint.label },
        name: members[0]?.class_name ?? classSlug,
        marker: {
          size: members.map((p) => (highlighted.has(p.material_id) ? 16 : 11)),
          color: visual.color,
          symbol: visual.symbol,
          line: {
            width: members.map((p) => (highlighted.has(p.material_id) ? 3 : 1)),
            color: members.map((p) =>
              highlighted.has(p.material_id) ? paint.highlight : paint.markerEdge,
            ),
          },
        },
        error_x: hasX
          ? {
              type: "data",
              symmetric: false,
              array: xErrors.map((e) => e?.plus ?? 0),
              arrayminus: xErrors.map((e) => e?.minus ?? 0),
              color: withAlpha(visual.color, 0.55),
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
              color: withAlpha(visual.color, 0.55),
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
          ? `M = ${formatNumber(level.value)} (${escapeHover(level.material_name)})`
          : `M = ${formatNumber(level.value)}`;
        result.push({
          x: xs,
          y: ys,
          type: "scatter",
          mode: "lines",
          name: label,
          line: {
            color: paint.ink,
            width: 2,
            dash: position === 0 ? "solid" : "dash",
          },
          hovertemplate: `${label}<extra></extra>`,
        });
      });
    }

    return result;
  }, [map, highlighted, showEnvelopes, showIntervals, showLabels, paint]);

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
    const base = paint.layout;
    return {
      ...base,
      autosize: true,
      height: 540,
      margin: { l: 80, r: 24, t: 16, b: 60 },
      hovermode: "closest",
      legend: { ...base.legend, orientation: "h", y: -0.18, font: { size: 11 } },
      xaxis: {
        ...base.xaxis,
        title: {
          text: axisTitle(map.x_axis.property_name, map.x_axis.symbol, map.x_axis.unit),
        },
        type: map.scale,
        zeroline: false,
      },
      yaxis: {
        ...base.yaxis,
        title: {
          text: axisTitle(map.y_axis.property_name, map.y_axis.symbol, map.y_axis.unit),
        },
        type: map.scale,
        zeroline: false,
      },
    };
  }, [map, paint]);

  return (
    <Card>
      <CardHeader
        headingLevel={2}
        title={t.figure}
        description={t.coverage(map.plotted_count, map.considered_count)}
        actions={
          <ChartToolbar
            target={container}
            disabled={map.points.length === 0}
            fileName={chartFileName(
              "mapa",
              map.y_axis.property_name,
              map.x_axis.property_name,
              map.scale,
            )}
          />
        }
      />
      <CardBody>
        {map.points.length === 0 ? (
          <EmptyState title={t.empty} />
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
      </CardBody>
    </Card>
  );
}
