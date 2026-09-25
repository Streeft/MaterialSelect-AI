"use client";

import { useMemo, useReducer, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Data, Layout, LayoutAxis } from "plotly.js";
import type { ChartScale, MapPoint, PropertyMap } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { formatNumber, prettyUnit } from "@/lib/format";
import { chartFileName, escapeHover, logTicks, toClosedRing, toXY, withAlpha } from "@/lib/charts";
import { chartTheme, classVisual } from "@/lib/design/palette";
import {
  ButtonGroup,
  ButtonGroupItem,
  DataQualityBadge,
  EmptyState,
  MissingValue,
  useResolvedTheme,
} from "@/components/ui";
import { ChartFrame } from "./ChartFrame";
import { IconChartScatter } from "@/components/ui/icons";
import { ChartLegend, type LegendItem } from "./ChartLegend";
import { ChartTooltip, type TooltipContent } from "./ChartTooltip";
import { FigureData, type FigureColumn } from "./FigureData";

// Plotly touches window/document, so it must never render on the server.
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const t = ptBR.map;

export interface BoxSelection {
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
}

type PlotlyShape = NonNullable<Layout["shapes"]>[number];

interface AshbyMapProps {
  map: PropertyMap;
  recordLabel?: string;
  displayScale?: ChartScale;
  isFetching?: boolean;
  highlightIds?: number[];
  showEnvelopes?: boolean;
  showIntervals?: boolean;
  showLabels?: boolean;
  selectionBox?: BoxSelection | null;
  onSelectBox?: (box: BoxSelection | null) => void;
  enableBoxSelect?: boolean;
  dragMode?: "select" | "zoom";
  onDragModeChange?: (mode: "select" | "zoom") => void;
  /**
   * D-91: fill the viewport's height instead of a fixed 540 px — the map is
   * the whole point of `/app/mapas`, so it takes the screen there. Other
   * screens embed the map beside other content and keep the fixed height.
   */
  fillHeight?: boolean;
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

/** `Name, symbol [unit]` — the axis title, and the header of its data column. */
function axisTitle(name: string, symbol: string | null, unit: string): string {
  const pretty = prettyUnit(unit);
  const head = symbol ? `${name}, ${symbol}` : name;
  return pretty ? `${head} [${pretty}]` : head;
}

/** `Name · unit` — the axis label drawn in the figure, as on the showcase map. */
function axisLabel(name: string, unit: string): string {
  const pretty = prettyUnit(unit);
  return pretty ? `${name} · ${pretty}` : name;
}

/**
 * The index expression as the showcase prints its guide (`E / ρ`): the two
 * axes' slugs read as their symbols. An expression that names anything else
 * falls back to the index's name — a slug next to symbols would read as a typo.
 */
function guideText(map: PropertyMap): string | undefined {
  const index = map.index;
  if (!index) return undefined;
  let text = index.expression;
  for (const axis of [map.x_axis, map.y_axis]) {
    if (!axis.property_slug || !axis.symbol) continue;
    text = text.replace(new RegExp(`\\b${axis.property_slug}\\b`, "g"), axis.symbol);
  }
  // Anything still spelled like a slug (three or more lowercase letters) that
  // is not a function name was a property off these two axes.
  const functions = new Set(["sqrt", "log", "ln", "exp", "abs", "min", "max"]);
  const leftovers = (text.match(/[a-z_][a-z0-9_]{2,}/g) ?? []).filter((w) => !functions.has(w));
  if (leftovers.length > 0) return index.name ?? index.expression;
  return text;
}

/**
 * Log-axis ticks at decades (and 3× on short axes), labelled in pt-BR (D-30).
 * The range is widened by a third of a decade each way, so a tick is ready
 * wherever Plotly's autorange stops; Plotly only draws the ones in view.
 */
function logAxisTicks(min: number | null, max: number | null) {
  const values =
    min !== null && max !== null ? logTicks(min / 3, max * 3) : null;
  if (!values) return {};
  return {
    tickmode: "array" as const,
    tickvals: values,
    ticktext: values.map((value) => formatNumber(value)),
  };
}

/**
 * One axis of one point, as the data table shows it: the value, the quality of
 * the datum behind it, and whatever the error bar in the figure was drawing.
 */
function axisCell(point: MapPoint, axis: "x" | "y"): ReactNode {
  const value = axis === "x" ? point.x : point.y;
  const low = axis === "x" ? point.x_min : point.y_min;
  const high = axis === "x" ? point.x_max : point.y_max;
  const uncertainty = axis === "x" ? point.x_uncertainty : point.y_uncertainty;
  const quality = axis === "x" ? point.x_quality : point.y_quality;
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-1.5">
        <span className="tabular-nums">{formatNumber(value)}</span>
        {quality !== null ? <DataQualityBadge state={quality} showLabel={false} /> : null}
      </span>
      {low !== null && high !== null ? (
        <span className="whitespace-nowrap text-2xs text-ink-muted">
          {t.interval}: {formatNumber(low)} – {formatNumber(high)}
        </span>
      ) : null}
      {uncertainty !== null ? (
        <span className="whitespace-nowrap text-2xs text-ink-muted">
          {t.uncertainty}: ±{formatNumber(uncertainty)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The readout of one point (D-95, the AI Studio tooltip): the material on top,
 * its class keyed by colour *and* shape, then the two coordinates in the
 * map's reading units, the index when there is one, and the evidence behind
 * each side. Rendered by React, so catalogue names are text, never markup.
 */
function tipFor(point: MapPoint, map: PropertyMap): TooltipContent {
  const xUnit = prettyUnit(map.x_axis.unit);
  const yUnit = prettyUnit(map.y_axis.unit);
  const visual = classVisual(point.class_slug);
  const rows: TooltipContent["rows"] = [
    { key: "class", label: point.class_name, value: "", color: visual.color, symbol: visual.symbol },
    { key: "x", label: map.x_axis.property_name, value: `${formatNumber(point.x)} ${xUnit}`.trim() },
    { key: "y", label: map.y_axis.property_name, value: `${formatNumber(point.y)} ${yUnit}`.trim() },
  ];
  if (point.x_min !== null && point.x_max !== null) {
    rows.push({ key: "ix", label: `${t.interval} X`, value: `${formatNumber(point.x_min)} – ${formatNumber(point.x_max)} ${xUnit}`.trim() });
  }
  if (point.y_min !== null && point.y_max !== null) {
    rows.push({ key: "iy", label: `${t.interval} Y`, value: `${formatNumber(point.y_min)} – ${formatNumber(point.y_max)} ${yUnit}`.trim() });
  }
  if (point.x_uncertainty !== null) {
    rows.push({ key: "ux", label: `${t.uncertainty} X`, value: `±${formatNumber(point.x_uncertainty)} ${xUnit}`.trim() });
  }
  if (point.y_uncertainty !== null) {
    rows.push({ key: "uy", label: `${t.uncertainty} Y`, value: `±${formatNumber(point.y_uncertainty)} ${yUnit}`.trim() });
  }
  if (map.index) {
    rows.push({
      key: "index",
      label: t.indexValue,
      value: point.index_value === null ? ptBR.quality.AUSENTE : formatNumber(point.index_value),
      emphasis: true,
    });
  }
  // Null exactly when that axis is an index — it has no single provenance of
  // its own, so the side is omitted rather than badged with an invented state.
  const qualityParts = [
    point.x_quality !== null ? `X: ${ptBR.quality[point.x_quality]}` : null,
    point.y_quality !== null ? `Y: ${ptBR.quality[point.y_quality]}` : null,
  ].filter((part): part is string => part !== null);
  const notes = [
    qualityParts.length > 0 ? `${t.quality}: ${qualityParts.join(" / ")}` : null,
    map.index && point.index_value === null
      ? point.index_undefined_reason ?? t.undefinedIndex
      : null,
  ].filter((note): note is string => note !== null);
  return { title: point.material_name, rows, note: notes.length > 0 ? notes.join(" · ") : undefined };
}

/** An axis title that keeps the theme's title font instead of replacing it. */
function titled(axis: Partial<LayoutAxis> | undefined, text: string): Partial<LayoutAxis> {
  const base = axis?.title;
  return { ...axis, title: { ...(typeof base === "object" ? base : {}), text } };
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
 *
 * **Still Plotly, dressed as MSDS's `ScatterMap` (D-80).** MSDS's scatter is a
 * fixed linear SVG; this map needs log–log axes, zoom and pan, and — for the
 * Chart Stage (D-60) — a box drawn in data coordinates that becomes a
 * selection criterion. So the engine stays and the look moves: the MSDS chart
 * card, the app's face, recessive gridlines, markers in a thin dark ring,
 * envelopes at 14 % fill / 50 % stroke of the class colour, the hover label as
 * `.msds-tooltip`, and Plotly's own legend replaced by MSDS legend buttons.
 * Hiding a class there sets `visible: false` on its traces; it never touches the
 * selection, which reads only `event.range` — the box, not the points in it.
 */
export function AshbyMap({
  map,
  recordLabel,
  displayScale,
  isFetching = false,
  highlightIds = [],
  showEnvelopes = true,
  showIntervals = true,
  showLabels = false,
  selectionBox,
  onSelectBox,
  enableBoxSelect = false,
  dragMode,
  onDragModeChange,
  fillHeight = false,
}: AshbyMapProps) {
  // Colours come from the tokens of whichever theme is on the document, so the
  // figure has to be rebuilt when the reader switches — not only recoloured.
  const theme = useResolvedTheme();
  const paint = useMemo(() => chartTheme(theme), [theme]);
  const highlighted = useMemo(() => new Set(highlightIds), [highlightIds]);

  const [localDragMode, setLocalDragMode] = useState<"select" | "zoom">("select");
  const activeDragMode = dragMode ?? localDragMode;
  // What "Navegar / Zoom" means right now: the modebar still offers pan, and a
  // pan picked there must not be undone by the next render.
  const [navMode, setNavMode] = useState<"zoom" | "pan">("zoom");
  const plotDragMode = enableBoxSelect && activeDragMode === "select" ? "select" : navMode;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // `react-plotly.js` keeps its bound handlers across an unmount it purged, so
  // after React's development double-mount (StrictMode) it believes
  // `onSelected` is still attached and skips it — the first box drawn after a
  // page load was silently ignored in `next dev`. One re-render once Plotly has
  // initialised hands it fresh handler identities, which it does rebind.
  // Harmless in production, where the component mounts once.
  const [, rebindHandlers] = useReducer((n: number) => n + 1, 0);

  const handleDragModeToggle = (mode: "select" | "zoom") => {
    setLocalDragMode(mode);
    if (mode === "zoom") setNavMode("zoom");
    onDragModeChange?.(mode);
  };

  // Keep the toggle honest when the reader switches tool in Plotly's modebar.
  // D-95: the readout under the pointer, drawn by the app instead of Plotly's
  // hover label — the same panel every other figure uses.
  const [tip, setTip] = useState<TooltipContent | null>(null);
  const handleHover = (event: { points?: { customdata?: unknown }[] }) => {
    const data = event.points?.[0]?.customdata;
    if (typeof data === "number") {
      const point = map.points[data];
      setTip(point ? tipFor(point, map) : null);
      return;
    }
    if (typeof data === "string" && data.startsWith("level:")) {
      const level = map.index?.levels[Number(data.slice("level:".length))];
      if (!level) return setTip(null);
      setTip({
        title: t.indexLine,
        rows: [
          {
            key: "level",
            label: level.material_name ?? "M",
            value: `M = ${formatNumber(level.value)}`,
            color: paint.accent,
            line: true,
          },
        ],
      });
      return;
    }
    setTip(null);
  };

  const handleRelayout = (event: Record<string, unknown>) => {
    const next = event.dragmode;
    if (next !== "zoom" && next !== "pan") return;
    setNavMode(next);
    if (enableBoxSelect && activeDragMode === "select") {
      setLocalDragMode("zoom");
      onDragModeChange?.("zoom");
    }
  };

  const toggleSeries = (key: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // When fetching with a different displayScale, use the pre-computed alt envelope
  // instead of the stale one. This enables instant visual feedback on scale toggle.
  const useAltEnvelopes =
    isFetching && displayScale && displayScale !== map.scale && map.envelopes_alt.length > 0;
  const renderEnvelopes = useAltEnvelopes ? map.envelopes_alt : map.envelopes;

  const handleSelected = (
    event: { range?: { x?: number[]; y?: number[] } } | null | undefined,
  ) => {
    // Two different events arrive here with no box, and only one is a clear.
    // A click on the plot in select mode sends *nothing* (`undefined`): the
    // reader cleared the region. But every `Plotly.react` — including the one
    // this very selection causes, when the new region reaches the layout as a
    // shape — re-runs Plotly's reselect pass, which emits an event *object*
    // (`{ points: [] }`) with no `range`. Treating that as a clear wiped every
    // region the instant it was drawn (found live, D-80); it is ignored.
    if (event && !event.range) return;
    const rx = event?.range?.x;
    const ry = event?.range?.y;
    if (!rx || !ry) {
      onSelectBox?.(null);
      return;
    }
    const x0 = rx[0];
    const x1 = rx[1];
    const y0 = ry[0];
    const y1 = ry[1];
    if (
      x0 === undefined ||
      x1 === undefined ||
      y0 === undefined ||
      y1 === undefined
    ) {
      onSelectBox?.(null);
      return;
    }
    // Plotly reports a box on a log axis in *data* units, not as exponents
    // (`selections/helpers.js`: `p2r` is `ax.p2d` for log axes). Raising 10 to
    // it — what this used to do — turned 2,5 g/cm³ into 316 (D-80).
    const xMinVal = Math.min(x0, x1);
    const xMaxVal = Math.max(x0, x1);
    const yMinVal = Math.min(y0, y1);
    const yMaxVal = Math.max(y0, y1);

    const cleanNum = (n: number) => {
      if (!Number.isFinite(n)) return n;
      return Number(n.toPrecision(4));
    };

    onSelectBox?.({
      xMin: cleanNum(xMinVal),
      xMax: cleanNum(xMaxVal),
      yMin: cleanNum(yMinVal),
      yMax: cleanNum(yMaxVal),
    });
  };

  const shapes = useMemo<PlotlyShape[]>(() => {
    if (!selectionBox) return [];
    const { xMin, xMax, yMin, yMax } = selectionBox;
    const hasAnyBound = xMin !== null || xMax !== null || yMin !== null || yMax !== null;
    if (!hasAnyBound) return [];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of map.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX)) {
      minX = 1;
      maxX = 1000;
      minY = 1;
      maxY = 1000;
    }

    const axisScale = displayScale || map.scale;
    const isLog = axisScale === "log";

    const x0 =
      xMin !== null ? xMin : isLog ? Math.max(1e-12, minX * 0.01) : minX - (maxX - minX) * 0.5;
    const x1 =
      xMax !== null ? xMax : isLog ? maxX * 100 : maxX + (maxX - minX) * 0.5;
    const y0 =
      yMin !== null ? yMin : isLog ? Math.max(1e-12, minY * 0.01) : minY - (maxY - minY) * 0.5;
    const y1 =
      yMax !== null ? yMax : isLog ? maxY * 100 : maxY + (maxY - minY) * 0.5;

    return [
      {
        type: "rect",
        xref: "x",
        yref: "y",
        x0,
        x1,
        y0,
        y1,
        line: {
          color: paint.accent,
          width: 2,
          dash: "dot",
        },
        // `withAlpha` reads `#rrggbb`; a token arrives as `rgb(…)`, so the
        // theme hands over the translucent fill itself.
        fillcolor: paint.accentFill,
      },
    ];
  }, [selectionBox, map.points, displayScale, map.scale, paint.accent, paint.accentFill]);

  const traces = useMemo<Data[]>(() => {
    const result: Data[] = [];

    // 1. Class envelopes, drawn first so points sit on top of them.
    if (showEnvelopes) {
      for (const envelope of renderEnvelopes) {
        const { xs, ys } = toClosedRing(envelope.polygon);
        if (xs.length < 2) continue; // a single material has no outline to show
        const visual = classVisual(envelope.class_slug);
        result.push({
          x: xs,
          y: ys,
          type: "scatter",
          mode: "lines",
          fill: xs.length > 2 ? "toself" : undefined,
          // The showcase's soft cloud: 15 % fill and a faint outline. The
          // outline stays, in the class's own dash: on a monochrome printout
          // it is the only thing left telling two envelopes apart.
          fillcolor: withAlpha(visual.color, 0.15),
          line: { color: withAlpha(visual.color, 0.35), width: 1, dash: visual.dash },
          hoverinfo: "skip",
          showlegend: false,
          visible: !hidden.has(`class:${envelope.class_slug}`),
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
        // D-95: Plotly finds the point; the readout is the app's own tooltip.
        // `none` (not `skip`) keeps the hover events firing.
        customdata: members.map((p) => map.points.indexOf(p)),
        hoverinfo: "none",
        type: "scatter",
        mode: showLabels ? "text+markers" : "markers",
        textposition: "top center",
        textfont: { size: 10, color: paint.label },
        name: members[0]?.class_name ?? classSlug,
        // The MSDS legend below the figure is the class filter now.
        showlegend: false,
        visible: !hidden.has(`class:${classSlug}`),
        // The showcase's marker: the class colour ringed in the card's own
        // surface, so overlapping points stay countable. The class *shape*
        // stays — it is the colour-blind- and greyscale-safe half of the
        // encoding (palette.ts), which a circle-only map would drop.
        marker: {
          size: 12,
          color: visual.color,
          symbol: visual.symbol,
          line: { width: 2, color: paint.surface },
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

    // 3. The showcase's highlight: a ring around the point, in the section
    // accent, drawn as its own open marker so the point keeps its colour.
    const halo = map.points.filter(
      (p) => highlighted.has(p.material_id) && !hidden.has(`class:${p.class_slug}`),
    );
    if (halo.length > 0) {
      result.push({
        x: halo.map((p) => p.x),
        y: halo.map((p) => p.y),
        type: "scatter",
        mode: "markers",
        marker: {
          size: 26,
          symbol: "circle-open",
          color: paint.accent,
          line: { width: 2, color: paint.accent },
        },
        hoverinfo: "skip",
        showlegend: false,
      });
    }

    // 4. Index lines. Slope and endpoints come from the backend untouched.
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
          showlegend: false,
          visible: !hidden.has(`level:${position}`),
          // The showcase's guide line: the section accent, 2 px.
          line: {
            color: paint.accent,
            width: 2,
            dash: position === 0 ? "solid" : "dash",
          },
          customdata: xs.map(() => `level:${position}`),
          hoverinfo: "none",
        });
      });
    }

    return result;
  }, [map, renderEnvelopes, highlighted, showEnvelopes, showIntervals, showLabels, paint, hidden]);

  const layout = useMemo<Partial<Layout>>(() => {
    const base = paint.layout;
    const axisScale = displayScale || map.scale;
    const isLog = axisScale === "log";
    const tickfont = { ...base.xaxis?.tickfont, family: paint.monoFamily, size: 10 };
    return {
      ...base,
      // pt-BR (D-30): decimal comma, thousands point — Plotly's own ticks on a
      // linear axis and its hover numbers follow the rest of the app.
      separators: ",.",
      autosize: true,
      // With `fillHeight` the container sets the height and Plotly's own
      // resize handler follows it; a number here would win over the CSS.
      height: fillHeight ? undefined : 540,
      margin: { l: 76, r: 24, t: 16, b: 56 },
      hoverlabel: {
        bgcolor: paint.tooltipBg,
        bordercolor: paint.tooltipBg,
        font: { color: paint.tooltipInk, family: base.font?.family, size: 12 },
      },
      hovermode: "closest",
      dragmode: plotDragMode,
      shapes,
      showlegend: false,
      // Zoom survives a legend toggle (same revision), and resets — with
      // Plotly's own selection outline — when the axes or the selected box
      // change, which is what every Plotly.react used to do before (D-80).
      uirevision: [
        map.x_axis.property_slug ?? map.x_axis.expression,
        map.y_axis.property_slug ?? map.y_axis.expression,
        axisScale,
        JSON.stringify(selectionBox ?? null),
      ].join("|"),
      xaxis: {
        ...titled(base.xaxis, axisLabel(map.x_axis.property_name, map.x_axis.unit)),
        type: axisScale,
        zeroline: false,
        tickfont,
        ...(isLog ? logAxisTicks(map.x_axis.min_value, map.x_axis.max_value) : {}),
      },
      yaxis: {
        ...titled(base.yaxis, axisLabel(map.y_axis.property_name, map.y_axis.unit)),
        type: axisScale,
        zeroline: false,
        tickfont,
        ...(isLog ? logAxisTicks(map.y_axis.min_value, map.y_axis.max_value) : {}),
      },
    };
  }, [map, paint, displayScale, plotDragMode, shapes, selectionBox, fillHeight]);

  // The legend MSDS draws under its scatter: one button per class (colour *and*
  // marker shape, D-28), then one per index level the backend traced.
  const legendItems = useMemo<LegendItem[]>(() => {
    const classes = new Map<string, string>();
    for (const point of map.points) {
      if (!classes.has(point.class_slug)) classes.set(point.class_slug, point.class_name);
    }
    const items: LegendItem[] = Array.from(classes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slug, name]) => {
        const visual = classVisual(slug);
        return { key: `class:${slug}`, label: name, color: visual.color, symbol: visual.symbol };
      });
    if (map.index?.available) {
      map.index.levels.forEach((level, position) => {
        if (toXY(level.points).xs.length < 2) return;
        items.push({
          key: `level:${position}`,
          label: level.material_name
            ? `M = ${formatNumber(level.value)} (${level.material_name})`
            : `M = ${formatNumber(level.value)}`,
          color: paint.accent,
          line: position === 0 ? "solid" : "dash",
        });
      });
    }
    return items;
  }, [map, paint.accent]);

  // The figure's own numbers, as columns. The index column only exists when the
  // figure drew one, and a point without an index carries the backend's reason
  // rather than a blank — the same sentence the hover already shows.
  const columns = useMemo<FigureColumn<MapPoint>[]>(() => {
    const result: FigureColumn<MapPoint>[] = [
      {
        key: "class",
        header: ptBR.chart.columnClass,
        cell: (point) => point.class_name,
      },
      {
        key: "x",
        header: axisTitle(map.x_axis.property_name, map.x_axis.symbol, map.x_axis.unit),
        numeric: true,
        cell: (point) => axisCell(point, "x"),
      },
      {
        key: "y",
        header: axisTitle(map.y_axis.property_name, map.y_axis.symbol, map.y_axis.unit),
        numeric: true,
        cell: (point) => axisCell(point, "y"),
      },
    ];
    if (map.index) {
      result.push({
        key: "index",
        header: t.indexValue,
        numeric: true,
        cell: (point) => {
          if (point.index_value !== null) return formatNumber(point.index_value);
          if (!point.index_undefined_reason) return null;
          return (
            <span className="flex flex-col items-end gap-0.5">
              <MissingValue />
              <span className="text-2xs text-ink-muted">{point.index_undefined_reason}</span>
            </span>
          );
        },
      });
    }
    return result;
  }, [map]);

  const isRegionActive =
    Boolean(selectionBox) &&
    (selectionBox?.xMin !== null ||
      selectionBox?.xMax !== null ||
      selectionBox?.yMin !== null ||
      selectionBox?.yMax !== null);

  const figureCaption = isRegionActive ? `${t.figure} — ${ptBR.chart.selectedRegion}` : t.figure;

  return (
    <ChartFrame
      figureIcon={<IconChartScatter />}
      eyebrow={t.figure}
      title={`${map.y_axis.property_name} × ${map.x_axis.property_name}`}
      meta={map.index ? `${t.guide}: ${guideText(map)}` : undefined}
      description={t.coverage(map.plotted_count, map.considered_count)}
      exportName={chartFileName("mapa", map.y_axis.property_name, map.x_axis.property_name, map.scale)}
      exportDisabled={map.points.length === 0}
      controls={
        enableBoxSelect ? (
          <ButtonGroup label={ptBR.chart.dragMode}>
            <ButtonGroupItem
              selected={activeDragMode === "select"}
              label={ptBR.chart.dragModeSelect}
              onClick={() => handleDragModeToggle("select")}
            />
            <ButtonGroupItem
              selected={activeDragMode === "zoom"}
              label={ptBR.chart.dragModeZoom}
              onClick={() => handleDragModeToggle("zoom")}
            />
          </ButtonGroup>
        ) : null
      }
      empty={map.points.length === 0 ? <EmptyState title={t.empty} /> : undefined}
      table={
        <FigureData
          caption={figureCaption}
          rows={map.points}
          rowKey={(point) => point.record_id ?? point.material_id}
          rowHeader={{
            header: recordLabel ?? ptBR.compare.columnMaterial,
            cell: (point) => point.material_name,
          }}
          columns={columns}
        />
      }
    >
      {/* `role="img"` collapses Plotly's thousands of `<path>` and tick nodes
          into one object for assistive technology. What replaces them is the
          data table behind "Ver tabela de dados", not a longer label. */}
      <div
        className={cn(
          "chart-plotly relative",
          // Viewport height minus the page header and the card's own toolbar
          // and legend, never shorter than a readable plot nor taller than a
          // square-ish one on a very tall screen.
          fillHeight && "h-[clamp(26rem,calc(100dvh-17rem),54rem)]",
        )}
        role="img"
        aria-label={ptBR.chart.figureLabel(t.figure)}
      >
        <Plot
          data={traces}
          layout={layout}
          config={{
            displaylogo: false,
            responsive: true,
            // Export lives in the card's toolbar (with the legend and title the
            // modebar's camera would leave out); the box is drawn through the
            // "Selecionar região" toggle, and lasso has no meaning for a
            // region stage. Zoom, pan and reset stay — nothing else offers them.
            modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d"],
          }}
          onSelected={
            enableBoxSelect ? (handleSelected as unknown as (event: unknown) => void) : undefined
          }
          onRelayout={handleRelayout as unknown as (event: unknown) => void}
          onHover={handleHover as unknown as (event: unknown) => void}
          onUnhover={() => setTip(null)}
          onInitialized={() => rebindHandlers()}
          style={{ width: "100%", height: fillHeight ? "100%" : undefined }}
          useResizeHandler
        />
        <ChartTooltip content={tip} />
      </div>
      <ChartLegend items={legendItems} hidden={hidden} onToggle={toggleSeries} />
    </ChartFrame>
  );
}
