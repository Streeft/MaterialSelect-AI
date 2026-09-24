"use client";

import { useCallback, useMemo } from "react";
import type { CompareCell, CompareMaterial, Comparison } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, formatScore, prettyUnit } from "@/lib/format";
import { axisLabels as buildAxisLabels, chartFileName } from "@/lib/charts";
import { classVisual } from "@/lib/design/palette";
import {
  Alert,
  Badge,
  Button,
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
} from "@/components/ui";
import { ChartFrame } from "./ChartFrame";
import { FigureData, type FigureColumn } from "./FigureData";
import {
  GroupedBarsFigure,
  HeatmapFigure,
  ParallelFigure,
  RadarFigure,
  type CompareAxisView,
  type CompareSeries,
} from "./ComparisonFigures";

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
  /** P2: which row is the reference, and how to change it. Both optional: the
      table is perfectly usable without one, and says so per cell. */
  referenceId?: number | null;
  onSetReference?: (materialId: number | null) => void;
}

/**
 * The percentage difference, or the written reason there is none (P2).
 *
 * Every state renders *text*, never a dash or a blank: "the reference has no
 * value" and "this unit has no true zero" look identical as an empty cell and
 * mean nothing alike (D-24).
 */
function DifferenceCell({ cell }: { cell: CompareCell }) {
  if (cell.difference_state === "calculada" && cell.difference_pct !== null) {
    const sign = cell.difference_pct > 0 ? "+" : "";
    return (
      <span className="tabular-nums text-ink">
        {sign}
        {formatNumber(cell.difference_pct)}%
      </span>
    );
  }
  return (
    <span className="text-xs text-ink-subtle">
      {t.difference[cell.difference_state as keyof typeof t.difference]}
    </span>
  );
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
export function ComparisonView({
  comparison,
  mode,
  referenceId = null,
  onSetReference,
}: ComparisonViewProps) {
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

  // What every figure draws: one series per material (class colour and marker
  // shape, D-28) and one axis per property. Symbols only when unambiguous: two
  // identical labels on one axis would be read as the same property.
  const series = useMemo<CompareSeries[]>(
    () =>
      materials.map((m) => {
        const visual = classVisual(m.class_slug);
        return {
          id: m.material_id,
          name: m.name,
          className: m.class_name,
          color: visual.color,
          symbol: visual.symbol,
          complete: m.complete,
        };
      }),
    [materials],
  );
  const axes = useMemo<CompareAxisView[]>(() => {
    const labels = buildAxisLabels(properties);
    return properties.map((p, i) => ({
      slug: p.property_slug,
      label: labels[i] ?? p.property_name,
      name: p.property_name,
      missing: p.missing_material_ids.length,
    }));
  }, [properties]);

  const canDraw =
    mode === "radar"
      ? properties.length >= 3 && materials.some((m) => m.complete)
      : materials.length > 0 && properties.length > 0;

  const fileName = chartFileName(
    "comparacao",
    mode,
    ...materials.map((m) => m.name).slice(0, 3),
  );

  // What the four figures actually plot is the normalised score, so that — and
  // not the raw value — is what their data table has to carry. A property with
  // no value stays `null` all the way here and is rendered as absence.
  const figureColumns: FigureColumn<CompareMaterial>[] = properties.map((property) => ({
    key: property.property_slug,
    header: property.property_name,
    numeric: true,
    cell: (material) => {
      const normalized = normalizedOf(material.material_id, property.property_slug);
      return normalized === null ? null : formatScore(normalized);
    },
  }));

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
                  {/* The percentage rides inside the property's own column
                      rather than doubling the table's width: it is a reading of
                      that property, not a separate measurement. */}
                  {referenceId !== null && (
                    <span className="ml-1 font-normal normal-case text-ink-subtle">
                      · {t.differenceHeader}
                    </span>
                  )}
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
                  {onSetReference &&
                    (referenceId === material.material_id ? (
                      <span className="mt-1 flex items-center gap-2">
                        <Badge tone="info">{t.reference}</Badge>
                        <Button
                          size="sm"
                          variant="link"
                          onClick={() => onSetReference(null)}
                        >
                          {t.clearReference}
                        </Button>
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="link"
                        className="mt-1"
                        onClick={() => onSetReference(material.material_id)}
                      >
                        {t.setReference}
                      </Button>
                    ))}
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
                        {referenceId !== null && cell && (
                          <span className="mt-1 block">
                            <DifferenceCell cell={cell} />
                          </span>
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
                      {referenceId !== null && (
                        <span className="mt-1 block">
                          <DifferenceCell cell={cell} />
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

  const figureLabel = ptBR.chart.figureLabel(t.figure);
  const figureProps = { figureLabel, series, axes, score: normalizedOf };

  return (
    <ChartFrame
      title={t.figure}
      description={t.normalizedScale}
      exportName={fileName}
      exportDisabled={!canDraw}
      notice={
        mode === "radar" && (properties.length < 3 || incomplete.length > 0) ? (
          <div className="mb-3 flex flex-col gap-2">
            {properties.length < 3 && <Alert tone="warning">{t.radarNeedsThree}</Alert>}
            {incomplete.length > 0 && (
              <Alert tone="warning">
                {t.radarSkipsMissing} ({incomplete.map((m) => m.name).join(", ")})
              </Alert>
            )}
          </div>
        ) : null
      }
      empty={canDraw ? undefined : <></>}
      table={
        <FigureData
          caption={`${t.figure} — ${t.normalizedScale}`}
          rows={materials}
          rowKey={(material) => material.material_id}
          rowHeader={{
            header: t.columnMaterial,
            cell: (material) => (
              <>
                {material.name}
                <span className="block text-xs font-normal text-ink-subtle">
                  {material.class_name}
                </span>
              </>
            ),
          }}
          columns={figureColumns}
        />
      }
    >
      {mode === "bars" && <GroupedBarsFigure {...figureProps} />}
      {mode === "radar" && <RadarFigure {...figureProps} />}
      {mode === "parallel" && <ParallelFigure {...figureProps} />}
      {mode === "heatmap" && <HeatmapFigure {...figureProps} />}
    </ChartFrame>
  );
}
