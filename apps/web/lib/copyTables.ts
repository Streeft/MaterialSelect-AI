import type {
  AtomicComposition,
  Comparison,
  CompositionEntry,
  Designation,
  FunnelStep,
  PropertyGroup,
  PropertyValueOut,
  StageResult,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { copyTablesText as c } from "@/lib/i18n-copy-tables";
import { toTsv } from "@/lib/clipboard";
import { formatNumber, prettyUnit } from "@/lib/format";
import { atomicContent, compositionContent, compositionOriginal, conditionOf } from "@/lib/composition";

const ABSENT = ptBR.quality.AUSENTE;

/**
 * The comparison table as TSV (D-164): the cells the screen shows, formatted by
 * the same functions, one column per property (unit in the header). A material
 * with no value gets the written word "Ausente", never a blank and never a 0.
 * With a reference, each property is followed by its difference column, and a
 * state with no percentage is written (D-24), not left empty.
 */
export function comparisonTsv(comparison: Comparison, referenceId: number | null): string {
  const { properties, materials } = comparison;
  const withDiff = referenceId !== null;
  const header = [
    c.comparison.material,
    c.comparison.className,
    ...properties.flatMap((p) => {
      const name = `${p.property_name} [${prettyUnit(p.unit)}]`;
      return withDiff ? [name, `${p.property_name} ${c.comparison.difference}`] : [name];
    }),
  ];
  const rows = materials.map((material) => {
    const bySlug = new Map(material.cells.map((cell) => [cell.property_slug, cell]));
    return [
      material.name,
      material.class_name,
      ...properties.flatMap((p) => {
        const cell = bySlug.get(p.property_slug);
        const value =
          !cell || cell.is_missing || cell.value === null ? ABSENT : formatNumber(cell.value);
        if (!withDiff) return [value];
        let diff: string;
        if (!cell) {
          diff = ptBR.compare.difference.valor_ausente;
        } else if (cell.difference_state === "calculada" && cell.difference_pct !== null) {
          diff = `${cell.difference_pct > 0 ? "+" : ""}${formatNumber(cell.difference_pct)}%`;
        } else {
          diff = ptBR.compare.difference[cell.difference_state as keyof typeof ptBR.compare.difference];
        }
        return [value, diff];
      }),
    ];
  });
  return toTsv(header, rows);
}

/**
 * The funnel as TSV (D-164): the initial count and, per stage, what remains and
 * what it removed, from the counts the backend sent. A count that does not apply
 * to a stage is written "Não se aplica": a blank would read as zero.
 */
export function funnelTsv(initialCount: number, funnel: readonly FunnelStep[]): string {
  const header = [
    c.funnel.stage,
    c.funnel.remaining,
    c.funnel.eliminated,
    c.funnel.undetermined,
    c.funnel.withoutLevel,
  ];
  const na = c.funnel.notApplicable;
  const rows = [
    [c.funnel.initial, String(initialCount), na, na, na],
    ...funnel.map((step, i) => [
      step.label,
      String(step.remaining),
      String((funnel[i - 1]?.remaining ?? initialCount) - step.remaining),
      step.undetermined == null ? na : String(step.undetermined),
      step.without_level == null ? na : String(step.without_level),
    ]),
  ];
  return toTsv(header, rows);
}

/** The value as the sheet writes it: the reading unit, interval or scalar. */
function sheetValue(p: PropertyValueOut): { text: string; unit: string } {
  const unit = prettyUnit(p.display_unit ?? p.original_unit);
  const min = p.display_min ?? p.value_min;
  const max = p.display_max ?? p.value_max;
  const typical = p.display_typical ?? p.value_typical;
  const scalar = p.display_value ?? p.value_scalar;
  const uncertainty = p.display_uncertainty ?? p.uncertainty;
  if (p.is_missing) return { text: ABSENT, unit: ABSENT };
  if (p.is_interval && min !== null && max !== null) {
    const base = `${formatNumber(min)} – ${formatNumber(max)}`;
    return {
      text: typical !== null ? `${base} (${c.sheet.typical}: ${formatNumber(typical)})` : base,
      unit,
    };
  }
  if (scalar !== null) {
    return {
      text: uncertainty !== null ? `${formatNumber(scalar)} ± ${formatNumber(uncertainty)}` : formatNumber(scalar),
      unit,
    };
  }
  return { text: ABSENT, unit: ABSENT };
}

/**
 * The property table of a material sheet as TSV (D-164), for the groups on
 * screen. Absence (value, unit) is written "Ausente"; a value with no recorded
 * source says so instead of leaving the cell empty.
 */
export function sheetTsv(groups: readonly PropertyGroup[]): string {
  const header = [
    c.sheet.group,
    c.sheet.property,
    c.sheet.value,
    c.sheet.unit,
    c.sheet.quality,
    c.sheet.source,
  ];
  const rows = groups.flatMap((group) =>
    group.properties.map((p) => {
      const { text, unit } = sheetValue(p);
      const quality = p.is_missing || p.data_quality === null ? "AUSENTE" : p.data_quality;
      return [
        ptBR.categories[group.category],
        p.property_name,
        text,
        unit,
        ptBR.quality[quality],
        p.source_label ?? c.sheet.noSource,
      ];
    }),
  );
  return toTsv(header, rows);
}

/**
 * The stage table of the funnel as TSV (D-173): one row per stage, with the
 * name the screen shows (the stage's own label or "Estágio N (tipo)"), a
 * switched-off stage flagged in words, and the two counts the backend sent.
 */
export function stagesTsv(stages: readonly StageResult[]): string {
  const sel = ptBR.selection;
  const header = [sel.stagesTitle, sel.stagePassedAlone, sel.stageRemaining];
  const rows = stages.map((stage) => {
    const name = stage.label || sel.stageNumber(stage.position + 1, stage.kind);
    return [
      stage.enabled ? name : `${name} (${sel.stageDisabled})`,
      formatNumber(stage.passed),
      formatNumber(stage.remaining),
    ];
  });
  return toTsv(header, rows);
}

/**
 * The calculated columns of the comparison as TSV (D-173). Each header says
 * "Calculada" first, so a derived number never pastes as a measured one
 * (D-153), then the index name, expression and unit. A material with no value
 * gets the written "Indefinido" with the evaluator's reason, never a blank or
 * a 0 (D-24). The numbers are the ones the backend evaluated.
 */
export function computedTsv(comparison: Comparison): string {
  const columns = comparison.computed ?? [];
  const k = ptBR.compare.computed;
  const header = [
    c.computed.material,
    c.computed.className,
    ...columns.map((column) => {
      const name =
        column.name !== column.expression ? `${column.name} (${column.expression})` : column.expression;
      const unit =
        column.dimension !== "dimensionless" ? ` [${prettyUnit(column.dimension)}]` : "";
      return `${k.badge}: ${name}${unit}`;
    }),
  ];
  const rows = comparison.materials.map((material) => [
    material.name,
    material.class_name,
    ...columns.map((column) => {
      const item = column.values.find((v) => v.material_id === material.material_id);
      if (item && item.value !== null) return formatNumber(item.value);
      return `${k.undefinedLabel}${item?.undefined_reason ? `: ${item.undefined_reason}` : ""}`;
    }),
  ]);
  return toTsv(header, rows);
}

/**
 * The composition shown on the sheet as TSV (D-173): the rows of the condition
 * on screen, in the words the table uses. The derived atomic percent gets a
 * column only when the backend derived it (D-117), exactly as on screen; a row
 * with no number says why, never an empty cell. A source with no location says so.
 */
export function compositionTsv(
  entries: readonly CompositionEntry[],
  atomic?: AtomicComposition,
): string {
  const k = c.composition;
  const d = ptBR.detail;
  const derived = atomic && atomic.reason === null ? atomic : null;
  const atomicByElement = new Map((derived?.entries ?? []).map((a) => [a.element, a]));
  const header = [
    k.condition,
    k.element,
    k.content,
    ...(derived ? [k.atomic] : []),
    k.original,
    k.source,
    k.citation,
    k.quality,
  ];
  const rows = entries.map((entry) => {
    const original = compositionOriginal(entry);
    const value = atomicByElement.get(entry.element);
    return [
      conditionOf(entry) ?? d.conditionNone,
      `${entry.element} (${entry.element_name})`,
      compositionContent(entry) || ABSENT,
      ...(derived ? [value ? atomicContent(value) : ABSENT] : []),
      original === null
        ? d.noOriginal
        : entry.conversion_method
          ? `${original} · ${d.conversion(entry.conversion_method)}`
          : original,
      entry.source_label || c.sheet.noSource,
      entry.citation ?? d.noCitation,
      ptBR.quality[entry.data_quality],
    ];
  });
  return toTsv(header, rows);
}

/** The designations of the sheet as TSV (D-173); no region or citation is written as such. */
export function designationsTsv(designations: readonly Designation[]): string {
  const k = c.designations;
  const d = ptBR.detail;
  const header = [k.system, k.code, k.region, k.source, k.citation];
  const rows = designations.map((designation) => [
    designation.system_label,
    designation.code,
    designation.region ?? d.noRegion,
    designation.source_label || c.sheet.noSource,
    designation.citation ?? d.noCitation,
  ]);
  return toTsv(header, rows);
}
