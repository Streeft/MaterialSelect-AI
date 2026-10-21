import type { Comparison, FunnelStep, PropertyGroup, PropertyValueOut } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { copyTablesText as c } from "@/lib/i18n-copy-tables";
import { toTsv } from "@/lib/clipboard";
import { formatNumber, prettyUnit } from "@/lib/format";

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
