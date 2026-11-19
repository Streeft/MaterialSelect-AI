"use client";

import { useMemo, useState } from "react";
import { ariaSort, nextSort, sortRows, type SortState, type SortValue } from "@/lib/tableSort";

/**
 * The sort of a table whose rows the page already has (D-254), for every list
 * outside the catalogue — the catalogue's own table sorts on the server (D-217).
 *
 * `columns` maps a column key to the label (or count) that column sorts by; keep
 * it outside the component, so the memo below is not rebuilt on every render.
 * `head(key)` is what a `SortTh` takes: the words `aria-sort` uses and the click
 * that moves the column ascending → descending → back to the order it arrived in.
 */
export function useTableSort<T, K extends string>(
  rows: readonly T[],
  columns: Readonly<Record<K, (row: T) => SortValue>>,
): {
  rows: readonly T[];
  sort: SortState<K> | null;
  head: (key: K) => { sort: "ascending" | "descending" | "none"; onSort: () => void };
} {
  const [sort, setSort] = useState<SortState<K> | null>(null);
  const sorted = useMemo(
    () => (sort ? sortRows(rows, columns[sort.key], sort.dir) : rows),
    [rows, columns, sort],
  );
  return {
    rows: sorted,
    sort,
    head: (key) => ({
      sort: ariaSort(sort, key),
      onSort: () => setSort((current) => nextSort(current, key)),
    }),
  };
}
