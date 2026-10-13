// Presentation helpers for the "Mudanças entre releases" screen (D-108).
//
// Everything here is wording and picking: which two releases may be compared,
// which pair to open first, how one side of a change reads in words. No number
// is computed, converted or compared — the backend already did all of that and
// sends each value in the reading unit, as the source wrote it, and canonical
// (ADR 0004). A side with no number is written out, never `0`, `—` or blank (D-24).

import type {
  CatalogRelease,
  ReleaseFieldChange,
  ReleaseNumbers,
  ReleaseReadingNumbers,
  ReleaseValueSide,
} from "@/lib/types";
import { formatNumber, prettyUnit } from "@/lib/format";
import { ptBR } from "@/lib/i18n";

const t = ptBR.releases;

/**
 * The releases that can be the other end of a comparison with `slug`: same
 * declared lineage, both real or both fictitious. The backend refuses anything
 * else (400); offering only these keeps the choice from ever reaching that.
 */
export function comparablePartners(releases: CatalogRelease[], slug: string): CatalogRelease[] {
  const base = releases.find((r) => r.slug === slug);
  if (!base || base.lineage === null) return [];
  return releases.filter(
    (r) => r.slug !== slug && r.lineage === base.lineage && r.is_demo === base.is_demo,
  );
}

/** Releases that have at least one partner — the base options of the selector. */
export function comparableReleases(releases: CatalogRelease[]): CatalogRelease[] {
  return releases.filter((r) => comparablePartners(releases, r.slug).length > 0);
}

/**
 * The pair to open when the URL names none: the latest release that has a
 * predecessor, compared with that predecessor. A real catalogue wins over the
 * fictitious one, so the demo never hides an official comparison.
 */
export function defaultPair(
  releases: CatalogRelease[],
): { base: string; target: string } | null {
  const withPrevious = releases.filter((r) => r.previous_slug !== null);
  const pool = withPrevious.some((r) => !r.is_demo)
    ? withPrevious.filter((r) => !r.is_demo)
    : withPrevious;
  const latest = pool[pool.length - 1];
  return latest && latest.previous_slug
    ? { base: latest.previous_slug, target: latest.slug }
    : null;
}

function unitSuffix(unit: string): string {
  return unit ? ` ${unit}` : "";
}

function numbersText(numbers: ReleaseNumbers, unit: string): string {
  const suffix = unitSuffix(unit);
  let text: string;
  if (numbers.min !== null && numbers.max !== null) {
    text = `${formatNumber(numbers.min)}–${formatNumber(numbers.max)}${suffix}`;
    if (numbers.typical !== null) text += ` (típico ${formatNumber(numbers.typical)})`;
  } else if (numbers.value !== null) {
    text = `${formatNumber(numbers.value)}${suffix}`;
  } else {
    return "";
  }
  if (numbers.uncertainty !== null) text += ` ± ${formatNumber(numbers.uncertainty)}`;
  return text;
}

/** A number in the unit the reader reads (D-70), or `null` when the side has none. */
export function readingText(reading: ReleaseReadingNumbers | null): string | null {
  if (!reading) return null;
  const text = numbersText(reading, reading.unit_label);
  return text === "" ? null : text;
}

/** The same value as the source wrote it, in its original unit. */
export function originalText(original: ReleaseNumbers | null): string | null {
  if (!original) return null;
  const text = numbersText(original, prettyUnit(original.unit));
  return text === "" ? null : text;
}

/**
 * One side of a change in words: the number when there is one, the state
 * written out when there is not ("declarado ausente pela fonte", "não
 * cadastrado nesta release").
 */
export function sideText(side: ReleaseValueSide | null): string {
  if (!side) return t.notRegistered;
  if (side.state === "rotulos" && side.labels.length > 0) return side.labels.join(", ");
  return readingText(side.reading) ?? side.state_label;
}

/** True when the side carries a number (so it is not an absence to be badged). */
export function sideHasNumber(side: ReleaseValueSide | null): boolean {
  return side !== null && readingText(side.reading) !== null;
}

/** A record field's text; `null` is "não informado", never an empty cell. */
export function fieldText(text: string | null): string {
  return text === null || text === "" ? t.notInformed : text;
}

/**
 * The change as one sentence — what an absence-to-value or value-to-absence
 * move means is said in words, beside the two cells that show it.
 */
export function describeChange(change: ReleaseFieldChange): string {
  if (change.kind === "texto") {
    return t.changeSentence(fieldText(change.before_text), fieldText(change.after_text));
  }
  if (change.kind === "escrita_da_fonte") {
    const before = originalText(change.before?.original ?? null);
    const after = originalText(change.after?.original ?? null);
    return t.writingSentence(before ?? sideText(change.before), after ?? sideText(change.after));
  }
  return t.changeSentence(sideText(change.before), sideText(change.after));
}

/** The record's name in the release where it exists (the target's, when both do). */
export function recordName(item: {
  base: { name: string } | null;
  target: { name: string } | null;
}): string {
  return item.target?.name ?? item.base?.name ?? "";
}
