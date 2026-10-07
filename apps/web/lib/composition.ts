/**
 * How a composition row reads on the sheet (D-105).
 *
 * Presentation only: the numbers arrive from the backend already converted to
 * mass percent (`normalized_*`) next to what the source wrote (`value_*`); this
 * only puts them into words, in pt-BR (D-30). Nothing is computed here — a
 * bound the source did not state stays unstated ("até 0,07", never "0 a
 * 0,07"), and a balance is never turned into a number.
 */
import type { CompositionEntry } from "@/lib/types";
import { formatNumber, prettyUnit } from "@/lib/format";
import { ptBR } from "@/lib/i18n";

const t = ptBR.detail;

function describe(
  min: number | null,
  max: number | null,
  nominal: number | null,
  unit: string,
): string {
  const n = (value: number) => `${formatNumber(value)}${unit}`;
  let range: string | null = null;
  if (min !== null && max !== null) range = t.contentRange(n(min), n(max));
  else if (max !== null) range = t.contentMax(n(max));
  else if (min !== null) range = t.contentMin(n(min));
  if (nominal === null) return range ?? "";
  return range === null ? t.contentNominal(n(nominal)) : t.contentNominalWithin(range, n(nominal));
}

/** The content in mass percent, as the sheet's main column states it. */
export function compositionContent(entry: CompositionEntry): string {
  if (entry.state === "resto") return t.contentBalance;
  if (entry.state === "ausente") return t.contentAbsent;
  return describe(entry.normalized_min, entry.normalized_max, entry.normalized_nominal, " %");
}

/**
 * What the source wrote, in its own unit — the first link of the unit trail
 * (principle 4). `null` for a row with no number.
 */
export function compositionOriginal(entry: CompositionEntry): string | null {
  if (entry.state !== "faixa" || !entry.original_unit) return null;
  const unit = entry.original_unit.trim() === "%" ? " %" : ` ${prettyUnit(entry.original_unit)}`;
  return describe(entry.value_min, entry.value_max, entry.value_nominal, unit);
}
