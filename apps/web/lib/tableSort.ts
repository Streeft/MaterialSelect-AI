/**
 * Sorting a table the reader already has (D-131).
 *
 * This only reorders rows that are on screen, by a label — a name, a class. It
 * never touches a value, a unit or a score: ranking is the backend's job
 * (principle 2), and a column that is a measurement is deliberately not
 * sortable here. The order of the *search* (relevance) is the default, and
 * "no sort" is a state the reader can return to.
 */

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** Accents and case do not decide order ("Água" sits with the As); digits sort as numbers. */
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** A sorted copy. Stable: equal labels keep the order they arrived in. */
export function sortRows<T>(rows: readonly T[], label: (row: T) => string, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => sign * collator.compare(label(a.row), label(b.row)) || a.index - b.index)
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
