"use client";

import { useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import type { CompareCell, CompareMaterial, Comparison } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, formatScore, prettyUnit } from "@/lib/format";
import { axisLabels as buildAxisLabels, chartFileName, escapeHover } from "@/lib/charts";
import { chartTheme, classVisual } from "@/lib/design/palette";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  DataQualityBadge,
  MissingValue,
  ProvenancePopover,
  RowHeader,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
  provenanceOfCell,
  qualityState,
  useResolvedTheme,
} from "@/components/ui";
import { ChartToolbar } from "./ChartToolbar";

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
 * The five comparison views.
 *
 * All of them read `normalized`, which the backend computed on the same scale
 * the ranking uses. A missing cell is `null` everywhere and is rendered as a
 * gap — never as a zero, which would silently rank an unknown material last.
 */
export function ComparisonView({ comparison, mode }: ComparisonViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const paint = useMemo(() => chartTheme(theme), [theme]);

  const { properties, materials } = comparison;
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
      ...paint.layout,
      autosize: true,
      height: 480,
      margin: { l: 70, r: 24, t: 20, b: 90 },
      legend: { ...paint.layout.legend, orientation: "h", y: -0.25, font: { size: 11 } },
    };

    if (mode === "bars") {
      return {
        data: materials.map((material) => ({
          type: "bar",
          name: material.name,
          x: axisLabels,
          y: properties.map((p) => normalizedOf(material.material_id, p.property_slug)),
          marker: { color: classVisual(material.class_slug).color },
          hovertemplate: `<b>${escapeHover(material.name)}</b><br>%{x}: %{y:.3f}<extra></extra>`,
        })),
        layout: {
          ...baseLayout,
          barmode: "group",
          yaxis: { ...baseLayout.yaxis, title: { text: t.normalizedScale }, range: [0, 1.05] },
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
            line: { color: classVisual(material.class_slug).color },
            marker: { symbol: classVisual(material.class_slug).symbol },
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
          line: { color: classVisual(material.class_slug).color, width: 2 },
          marker: { size: 8, symbol: classVisual(material.class_slug).symbol },
          hovertemplate: `<b>${escapeHover(material.name)}</b><br>%{x}: %{y:.3f}<extra></extra>`,
        })),
        layout: {
          ...baseLayout,
          yaxis: { ...baseLayout.yaxis, title: { text: t.normalizedScale }, range: [0, 1.05] },
          xaxis: { ...baseLayout.xaxis, type: "category" },
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
  }, [mode, materials, properties, paint, normalizedOf]);

  const fileName = chartFileName(
    "comparacao",
    mode,
    ...materials.map((m) => m.name).slice(0, 3),
  );

  if (mode === "table") {
    return (
      <TableScroll label={t.figure}>
        <Table>
          <TableCaption>
            {t.title}: {t.normalizedScale}
          </TableCaption>
          <THead>
            <Tr>
              <Th>{t.columnMaterial}</Th>
              {properties.map((p) => (
                <Th key={p.property_slug}>
                  {p.property_name}
                  <span className="ml-1 font-normal normal-case text-ink-subtle">
                    [{prettyUnit(p.unit)}]
                  </span>
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {materials.map((material) => (
              <Tr key={material.material_id}>
                <RowHeader>
                  {material.name}
                  <span className="block text-xs font-normal text-ink-subtle">
                    {material.class_name}
                  </span>
                </RowHeader>
                {properties.map((p) => {
                  const cell = lookup.get(material.material_id)?.get(p.property_slug);
                  // No cell at all is the same fact as a cell flagged missing:
                  // nothing was recorded. Both get the badge, never a dash.
                  if (!cell || cell.is_missing || cell.value === null) {
                    return (
                      <Td key={p.property_slug}>
                        {cell ? (
                          <ProvenancePopover provenance={provenanceOfCell(cell, p.unit)}>
                            <MissingValue />
                          </ProvenancePopover>
                        ) : (
                          <MissingValue />
                        )}
                      </Td>
                    );
                  }
                  const provenance = provenanceOfCell(cell, p.unit);
                  return (
                    <Td key={p.property_slug} className="text-ink">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        {/* §3.2: the whole chain behind the number, one click
                            away, instead of grey micro-text nobody reads. */}
                        <ProvenancePopover provenance={provenance}>
                          <span className="tabular-nums">{formatNumber(cell.value)}</span>
                        </ProvenancePopover>
                        <DataQualityBadge state={qualityState(provenance)} showLabel={false} />
                      </span>
                      {cell.normalized !== null && (
                        <span className="mt-1 flex items-center gap-1">
                          <span className="h-1.5 w-16 overflow-hidden rounded bg-surface-sunken">
                            <span
                              className="block h-full bg-brand-500"
                              style={{ width: `${cell.normalized * 100}%` }}
                            />
                          </span>
                          <span className="text-xs tabular-nums text-ink-subtle">
                            {formatScore(cell.normalized)}
                          </span>
                        </span>
                      )}
                    </Td>
                  );
                })}
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableScroll>
    );
  }

  return (
    <Card>
      <CardHeader
        headingLevel={2}
        title={t.figure}
        description={t.normalizedScale}
        actions={<ChartToolbar target={container} fileName={fileName} disabled={!figure} />}
      />
      <CardBody className="flex flex-col gap-3">
        {mode === "radar" && properties.length < 3 && (
          <Alert tone="warning">{t.radarNeedsThree}</Alert>
        )}
        {mode === "radar" && incomplete.length > 0 && (
          <Alert tone="warning">
            {t.radarSkipsMissing} ({incomplete.map((m) => m.name).join(", ")})
          </Alert>
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
      </CardBody>
    </Card>
  );
}
