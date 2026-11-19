/**
 * Sorting a table the reader already has (D-131).
 *
 * This only reorders rows that are on screen, by a label — a name, a class. It
 * never touches a value, a unit or a score: ranking is the backend's job
 * (principle 2), and a column that is a measurement is deliberately not
 * sortable here. (A *count* — how many data cite a source, how many materials a
 * process serves — is a number the server already sent, so it sorts, D-254.) The order of the *search* (relevance) is the default, and
 * "no sort" is a state the reader can return to.
 */

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** Accents and case do not decide order ("Água" sits with the As); digits sort as numbers. */
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/**
 * What a column hands the sorter: a label, a count, or nothing. Nothing is a
 * state, not a zero (principle 3): a row without the value sits after every row
 * that has one, whichever way the column is sorted.
 */
export type SortValue = string | number | null | undefined;

function compareValues(a: NonNullable<SortValue>, b: NonNullable<SortValue>): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/** A sorted copy. Stable: equal labels keep the order they arrived in; absent values go last. */
export function sortRows<T>(rows: readonly T[], label: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: label(row) }))
    .sort((a, b) => {
      const aMissing = a.value === null || a.value === undefined;
      const bMissing = b.value === null || b.value === undefined;
      if (aMissing || bMissing) return Number(aMissing) - Number(bMissing) || a.index - b.index;
      return sign * compareValues(a.value!, b.value!) || a.index - b.index;
    })
    .map(({ row }) => row);
}

/** Clicking a header: first ascending, then descending, then back to the original order. */
export function nextSort<K extends string>(
  current: SortState<K> | null,
  key: K,
): SortState<K> | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  return current.dir === "asc" ? { key, dir: "desc" } : null;
}

export function ariaSort<K extends string>(
  current: SortState<K> | null,
  key: K,
): "ascending" | "descending" | "none" {
  if (!current || current.key !== key) return "none";
  return current.dir === "asc" ? "ascending" : "descending";
}
