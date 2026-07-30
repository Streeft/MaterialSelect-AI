"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import type { CompareCell, CompareMaterial, Comparison } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import {
  axisLabels as buildAxisLabels,
  chartFileName,
  classColors,
  downloadPlotImage,
  escapeHover,
} from "@/lib/charts";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const t = ptBR.compare;

export type ComparisonMode = "table" | "bars" | "radar" | "parallel" | "heatmap";

export const COMPARISON_MODES: { key: ComparisonMode; label: string }[] = [
  { key: "table", label: t.viewTable },
  { key: "bars", label: t.viewBars },
  { key: "radar", label: t.viewRadar },
  { key: "parallel", label: t.viewParallel },
  { key: "heatmap", label: t.viewHeatmap },
];

interface ComparisonViewProps {
  comparison: Comparison;
  mode: ComparisonMode;
}

/** Index a material's cells by property slug — the API guarantees one per property. */
function cellsBySlug(material: CompareMaterial): Map<string, CompareCell> {
  return new Map(material.cells.map((cell) => [cell.property_slug, cell]));
}

/**
 * Unit suffix for inline text.
 *
 * `prettyUnit` renders a dimensionless unit as an em dash, which reads as a
 * missing value when it trails a number ("3,5 —"). Inline, no suffix is the
 * honest rendering; the column header still carries the "[—]" marker.
 */
function unitSuffix(unit: string | null): string {
  const pretty = prettyUnit(unit);
  return pretty && pretty !== "—" ? ` ${pretty}` : "";
}

/** Human-readable original value with its unit, for the traceability column. */
function originalText(cell: CompareCell): string {
  if (cell.is_missing) return t.missing;
  const unit = unitSuffix(cell.original_unit);
  if (cell.value_min !== null && cell.value_max !== null) {
    return `${formatNumber(cell.value_min)} – ${formatNumber(cell.value_max)}${unit}`;
  }
  if (cell.original_value === null) return "—";
  const uncertainty =
    cell.uncertainty !== null ? ` ± ${formatNumber(cell.uncertainty)}` : "";
  return `${formatNumber(cell.original_value)}${uncertainty}${unit}`;
}

/**
 * The five comparison views.
 *
 * All of them read `normalized`, which the backend computed on the same scale
 * the ranking uses. A missing cell is `null` everywhere and is rendered as a
 * gap — never as a zero, which would silently rank an unknown material last.
 */
export function ComparisonView({ comparison, mode }: ComparisonViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"png" | "svg" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const { properties, materials } = comparison;
  const colors = useMemo(
    () => classColors(materials.map((m) => m.class_slug)),
    [materials],
  );
  const lookup = useMemo(
    () => new Map(materials.map((m) => [m.material_id, cellsBySlug(m)])),
    [materials],
  );

  const normalizedOf = useCallback(
    (materialId: number, slug: string): number | null =>
      lookup.get(materialId)?.get(slug)?.normalized ?? null,
    [lookup],
  );

  const incomplete = materials.filter((m) => !m.complete);

  const figure = useMemo<{ data: Data[]; layout: Partial<Layout> } | null>(() => {
    // Symbols only when unambiguous: two identical labels would collapse into
    // one categorical column and silently merge the two series.
    const axisLabels = buildAxisLabels(properties);
    const baseLayout: Partial<Layout> = {
      autosize: true,
      height: 480,
      margin: { l: 70, r: 24, t: 20, b: 90 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      legend: { orientation: "h", y: -0.25, font: { size: 11 } },
    };

    if (mode === "bars") {
      return {
        data: materials.map((material) => ({
          type: "bar",
          name: material.name,
          x: axisLabels,
          y: properties.map((p) => normalizedOf(material.material_id, p.property_slug)),
          marker: { color: colors[material.class_slug] },
          hovertemplate: `<b>${escapeHover(material.name)}</b><br>%{x}: %{y:.3f}<extra></extra>`,
        })),
        layout: {
          ...baseLayout,
          barmode: "group",
          yaxis: { title: { text: t.normalizedScale }, range: [0, 1.05] },
        },
      };
    }

    if (mode === "radar") {
      // scatterpolar closes a polygon; a gap in it would be read as a value.
      // Only materials with every property are drawn, and the rest are listed.
      const complete = materials.filter((m) => m.complete);
      return {
        data: complete.map((material) => {
          const values = properties.map(
            (p) => normalizedOf(material.material_id, p.property_slug) ?? 0,
          );
          return {
            type: "scatterpolar",
            name: material.name,
            // Repeat the first vertex so the outline closes.
            r: [...values, values[0] ?? 0],
            theta: [...axisLabels, axisLabels[0] ?? ""],
            fill: "toself",
            opacity: 0.35,
            line: { color: colors[material.class_slug] },
            hovertemplate: `<b>${escapeHover(material.name)}</b><br>%{theta}: %{r:.3f}<extra></extra>`,
          } as Data;
        }),
        layout: {
          ...baseLayout,
          polar: { radialaxis: { visible: true, range: [0, 1] } },
        },
      };
    }

    if (mode === "parallel") {
      // Implemented as a line chart rather than Plotly's `parcoords`: the latter
      // cannot express a missing coordinate, and inventing one would break the
      // core rule of the project. Here a gap simply breaks the line.
      return {
        data: materials.map((material) => ({
          type: "scatter",
          mode: "lines+markers",
          name: material.name,
          x: axisLabels,
          y: properties.map((p) => normalizedOf(material.material_id, p.property_slug)),
          connectgaps: false,
          line: { color: colors[material.class_slug], width: 2 },
          marker: { size: 8 },
          hovertemplate: `<b>${escapeHover(material.name)}</b><br>%{x}: %{y:.3f}<extra></extra>`,
        })),
        layout: {
          ...baseLayout,
          yaxis: { title: { text: t.normalizedScale }, range: [0, 1.05] },
          xaxis: { type: "category" },
        },
      };
    }

    if (mode === "heatmap") {
      return {
        data: [
          {
            type: "heatmap",
            x: axisLabels,
            y: materials.map((m) => m.name),
            z: materials.map((m) =>
              properties.map((p) => normalizedOf(m.material_id, p.property_slug)),
            ),
            zmin: 0,
            zmax: 1,
            colorscale: "Viridis",
            hoverongaps: false,
            colorbar: { title: { text: "0 – 1" }, thickness: 12 },
            hovertemplate: "%{y}<br>%{x}: %{z:.3f}<extra></extra>",
          },
        ],
        layout: {
          ...baseLayout,
          height: Math.max(260, 60 + materials.length * 34),
          margin: { l: 160, r: 24, t: 20, b: 70 },
        },
      };
    }

    return null; // table mode is plain HTML
  }, [mode, materials, properties, colors, normalizedOf]);

  async function handleExport(format: "png" | "svg") {
    setExportError(null);
    setExporting(format);
    try {
      await downloadPlotImage(
        container.current,
        format,
        chartFileName("comparacao", mode, ...materials.map((m) => m.name).slice(0, 3)),
      );
    } catch {
      setExportError(ptBR.map.exportError);
    } finally {
      setExporting(null);
    }
  }

  const buttonClass =
    "rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50";

  if (mode === "table") {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">
            {t.title}: {t.normalizedScale}
          </caption>
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.columnMaterial}
              </th>
              {properties.map((p) => (
                <th key={p.property_slug} scope="col" className="px-3 py-2">
                  {p.property_name}
                  <span className="ml-1 font-normal normal-case text-slate-400">
                    [{prettyUnit(p.unit)}]
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {materials.map((material) => (
              <tr key={material.material_id}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-brand-700">
                  {material.name}
                  <span className="block text-xs font-normal text-slate-400">
                    {material.class_name}
                  </span>
                </th>
                {properties.map((p) => {
                  const cell = lookup.get(material.material_id)?.get(p.property_slug);
                  if (!cell || cell.is_missing) {
                    return (
                      <td key={p.property_slug} className="px-3 py-2 text-slate-400">
                        {t.missing}
                      </td>
                    );
                  }
                  return (
                    <td key={p.property_slug} className="px-3 py-2 text-slate-700">
                      <span className="tabular-nums">
                        {cell.value === null ? "—" : formatNumber(cell.value)}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {t.original}: {originalText(cell)}
                      </span>
                      {cell.normalized !== null && (
                        <span className="mt-1 flex items-center gap-1">
                          <span className="h-1.5 w-16 overflow-hidden rounded bg-slate-100">
                            <span
                              className="block h-full bg-brand-500"
                              style={{ width: `${cell.normalized * 100}%` }}
                            />
                          </span>
                          <span className="text-xs tabular-nums text-slate-400">
                            {cell.normalized.toFixed(2)}
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{t.normalizedScale}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={() => void handleExport("png")}
            disabled={exporting !== null}
          >
            {exporting === "png" ? ptBR.map.exporting : t.exportPng}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => void handleExport("svg")}
            disabled={exporting !== null}
          >
            {exporting === "svg" ? ptBR.map.exporting : t.exportSvg}
          </button>
        </div>
      </div>

      {exportError && (
        <p role="alert" className="mb-2 text-xs text-red-600">
          {exportError}
        </p>
      )}

      {mode === "radar" && properties.length < 3 && (
        <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t.radarNeedsThree}
        </p>
      )}
      {mode === "radar" && incomplete.length > 0 && (
        <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t.radarSkipsMissing} ({incomplete.map((m) => m.name).join(", ")})
        </p>
      )}

      {figure && (
        <div ref={container}>
          <Plot
            data={figure.data}
            layout={figure.layout}
            config={{ displaylogo: false, responsive: true }}
            style={{ width: "100%" }}
            useResizeHandler
          />
        </div>
      )}
    </div>
  );
}
