"use client";

import { useCallback, useMemo } from "react";
import type { CompareCell, CompareMaterial, Comparison } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, formatScore, prettyUnit } from "@/lib/format";
import { axisLabels as buildAxisLabels, chartFileName } from "@/lib/charts";
import { classVariant, classVisual } from "@/lib/design/palette";
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
import { PropertyHint } from "@/components/glossary/PropertyHint";
import { ChartFrame } from "./ChartFrame";
import { DENSE_FROM } from "./comparisonDensity";
import { FigureData, type FigureColumn } from "./FigureData";
import { CopyTableButton } from "@/components/selection/CopyTableButton";
import { comparisonTsv } from "@/lib/copyTables";
import { copyTablesText } from "@/lib/i18n-copy-tables";
import {
  GroupedBarsFigure,
  HeatmapFigure,
  ParallelFigure,
  RadarFigure,
  type CompareAxisView,
  type CompareSeries,
} from "./ComparisonFigures";

const t = ptBR.compare;

/** Past this many materials, members of one class are told apart by tone and marker (D-187). */
const CLASS_VARIANTS_FROM = 12;

export type ComparisonMode =
  | "table"
  | "bars"
  | "radar"
  | "parallel"
  | "heatmap";

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

/**
 * What the threshold says about the table, in words (D-128, D-31).
 *
 * The highlight is never colour alone: this block names every property above
 * the threshold with its backend-computed spread, and every property whose
 * spread could not be computed with the reason. All percentages arrive ready.
 */
export function ThresholdSummary({ comparison }: { comparison: Comparison }) {
  const threshold = comparison.threshold_pct;
  if (threshold === null || threshold === undefined) return null;
  const pct = formatNumber(threshold);
  const above = comparison.properties.filter((p) => p.exceeds_threshold === true);
  const unchecked = comparison.properties.filter(
    (p) => p.spread_state !== undefined && p.spread_state !== "calculada",
  );
  return (
    <div className="well flex flex-col gap-1 text-sm text-ink" role="status">
      {above.length === 0 ? (
        <p>{t.threshold.summaryNone(pct)}</p>
      ) : (
        <>
          <p className="font-semibold">{t.threshold.summaryTitle(pct, above.length)}</p>
          <ul className="list-disc pl-5">
            {above.map((p) => (
              <li key={p.property_slug}>
                {t.threshold.summaryItem(
                  p.property_name,
                  p.spread_pct === null || p.spread_pct === undefined
                    ? ""
                    : formatNumber(p.spread_pct),
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {unchecked.length > 0 && (
        <ul className="text-support text-ink-subtle">
          {unchecked.map((p) => (
            <li key={p.property_slug}>
              {p.property_name}: {t.threshold.spread[p.spread_state as keyof typeof t.threshold.spread]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The names of `materials`, all of them for a few and the first dozen plus a count for many (D-187). */
function listNames(materials: CompareMaterial[]): string {
  const NAMED = 12;
  const names = materials.slice(0, NAMED).map((m) => m.name).join(", ");
  return materials.length > NAMED ? `${names} e mais ${materials.length - NAMED}` : names;
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
  //
  // D-187: with a few materials the class look is the whole story. With many,
  // several share a class, so the k-th of a class takes its own tone and, every
  // third, its own marker shape (`classVariant`); the first keeps the class look.
  const series = useMemo<CompareSeries[]>(() => {
    const seen = new Map<string, number>();
    const crowded = materials.length > CLASS_VARIANTS_FROM;
    return materials.map((m) => {
      const visual = classVisual(m.class_slug);
      const k = seen.get(m.class_slug) ?? 0;
      seen.set(m.class_slug, k + 1);
      const look = crowded ? classVariant(visual, k) : visual;
      return {
        id: m.material_id,
        name: m.name,
        className: m.class_name,
        color: look.color,
        symbol: look.symbol,
        complete: m.complete,
      };
    });
  }, [materials]);
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
  const figureColumns: FigureColumn<CompareMaterial>[] = properties.map(
    (property) => ({
      key: property.property_slug,
      header: property.property_name,
      numeric: true,
      cell: (material) => {
        const normalized = normalizedOf(
          material.material_id,
          property.property_slug,
        );
        return normalized === null ? null : formatScore(normalized);
      },
    }),
  );

  if (mode === "table") {
    // Many rows: the box gets a height so the header (sticky) and the material
    // column (sticky) stay in view while the reader scrolls both ways.
    const wide = materials.length > 12;
    const hint = t.wideHint(materials.length);
    return (
      <div className="flex flex-col gap-3">
        {hint !== null && (
          <p className="text-support text-ink-subtle">{hint}</p>
        )}
        <div className="flex justify-end">
          <CopyTableButton
            ariaLabel={copyTablesText.comparison.aria}
            getText={() => comparisonTsv(comparison, referenceId)}
          />
        </div>
        <ThresholdSummary comparison={comparison} />
        <TableScroll
          label={t.tableRegion(materials.length, properties.length)}
          className={wide ? "max-h-[70vh] overflow-y-auto" : undefined}
        >
          <Table>
            <TableCaption>
              {t.title}: {t.normalizedScale}
            </TableCaption>
            <THead>
              <Tr>
                <Th className="sticky left-0 z-20 bg-well">
                  {t.columnMaterial}
                </Th>
                {properties.map((p) => (
                  <Th
                    key={p.property_slug}
                    className={p.exceeds_threshold === true ? "bg-warning-soft text-warning-fg" : undefined}
                  >
                    {p.property_name}
                    <span className="ml-1 font-normal normal-case text-ink-subtle">
                      [{prettyUnit(p.unit)}]
                    </span>
                    <PropertyHint
                      slug={p.property_slug}
                      name={p.property_name}
                      className="ml-1.5 align-middle"
                    />
                    {/* The percentage rides inside the property's own column
                      rather than doubling the table's width: it is a reading of
                      that property, not a separate measurement. */}
                    {referenceId !== null && (
                      <span className="ml-1 font-normal normal-case text-ink-subtle">
                        · {t.differenceHeader}
                      </span>
                    )}
                    {/* D-128: the highlight is a sentence first and a colour
                      second, and the spread's absence is written, not blank. */}
                    {comparison.threshold_pct != null && (
                      <span className="mt-1 block font-normal normal-case">
                        {p.exceeds_threshold === true ? (
                          <Badge tone="warning">
                            {t.threshold.above}
                            {p.spread_pct != null && ` · ${t.threshold.headerSpread(formatNumber(p.spread_pct))}`}
                          </Badge>
                        ) : p.spread_state === "calculada" && p.spread_pct != null ? (
                          <span className="text-xs text-ink-subtle">
                            {t.threshold.below} · {t.threshold.headerSpread(formatNumber(p.spread_pct))}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-subtle">{t.threshold.unavailable}</span>
                        )}
                      </span>
                    )}
                  </Th>
                ))}
              </Tr>
            </THead>
            <TBody>
              {materials.map((material) => (
                <Tr key={material.material_id}>
                  <RowHeader className="sticky left-0 z-[1] bg-panel">
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
                    const cell = lookup
                      .get(material.material_id)
                      ?.get(p.property_slug);
                    // No cell at all is the same fact as a cell flagged missing:
                    // nothing was recorded. Both get the badge, never a dash.
                    if (!cell || cell.is_missing || cell.value === null) {
                      return (
                        <Td key={p.property_slug}>
                          {cell ? (
                            <ProvenancePopover
                              provenance={provenanceOfCell(cell, p.unit)}
                            >
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
                            <span className="tabular-nums">
                              {formatNumber(cell.value)}
                            </span>
                          </ProvenancePopover>
                          <DataQualityBadge
                            state={qualityState(provenance)}
                            showLabel={false}
                          />
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
                            {cell.exceeds_threshold === true && (
                              <Badge tone="warning" className="ml-2">
                                {t.threshold.cellAbove}
                              </Badge>
                            )}
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
      </div>
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
        (mode === "radar" && (properties.length < 3 || incomplete.length > 0)) ||
        (mode !== "heatmap" && materials.length > DENSE_FROM) ? (
          <div className="mb-3 flex flex-col gap-2">
            {mode !== "heatmap" && materials.length > DENSE_FROM && (
              <p className="text-support text-ink-subtle">{t.denseFigure(materials.length)}</p>
            )}
            {mode === "radar" && properties.length < 3 && (
              <Alert tone="warning">{t.radarNeedsThree}</Alert>
            )}
            {mode === "radar" && incomplete.length > 0 && (
              <Alert tone="warning">
                {t.radarSkipsMissing} ({listNames(incomplete)})
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
