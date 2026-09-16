"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, deriveAhpWeights } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatScore } from "@/lib/format";
import { Alert, Select, SelectOption, Spinner } from "@/components/ui";

const t = ptBR.selection.ahp;

/**
 * Saaty's fundamental 1-9 scale. Only the odd anchors (1, 3, 5, 7, 9) carry a
 * verbal description of their own in Saaty's own scale — 2/4/6/8 are
 * unlabeled compromises between two anchors — so this picker offers exactly
 * those nine points (five anchors plus their four reciprocals) instead of
 * asking someone to type a raw number.
 */
const JUDGMENTS: { key: string; value: number; label: string }[] = [
  { key: "9", value: 9, label: t.judgmentExtreme },
  { key: "7", value: 7, label: t.judgmentVeryStrong },
  { key: "5", value: 5, label: t.judgmentStrong },
  { key: "3", value: 3, label: t.judgmentModerate },
  { key: "1", value: 1, label: t.judgmentEqual },
  { key: "1/3", value: 1 / 3, label: t.judgmentModerateReverse },
  { key: "1/5", value: 1 / 5, label: t.judgmentStrongReverse },
  { key: "1/7", value: 1 / 7, label: t.judgmentVeryStrongReverse },
  { key: "1/9", value: 1 / 9, label: t.judgmentExtremeReverse },
];
const JUDGMENT_KEY_BY_VALUE = new Map(JUDGMENTS.map((j) => [j.value, j.key]));
const VALUE_BY_JUDGMENT_KEY = new Map(JUDGMENTS.map((j) => [j.key, j.value]));
const CONSISTENCY_THRESHOLD = 0.1; // Saaty's own threshold — matches app.domain.ahp.

function pairKey(a: string, b: string): string {
  return `${a}|${b}`;
}

/** The judgment picker's key for a stored value. Defaults to "equal" for any
 * value that was never one of the nine picker points (only reachable today
 * via the default of 1 — kept defensive rather than assumed). */
function judgmentKeyFor(value: number): string {
  return JUDGMENT_KEY_BY_VALUE.get(value) ?? "1";
}

export interface AhpCriterionRef {
  key: string;
  label: string;
}

interface AhpMatrixInputProps {
  criteria: AhpCriterionRef[];
  onDerived: (weights: Record<string, number>) => void;
}

/**
 * Pairwise-comparison (AHP) input for deriving ranking weights.
 *
 * Only the upper triangle is editable — each pair is judged once. The lower
 * triangle is the read-only reciprocal, and the diagonal is fixed at 1: both
 * follow from the upper triangle by construction, so showing them as
 * separate editable cells would let someone create a matrix the backend
 * would then reject as non-reciprocal for no reason visible on screen.
 *
 * Recomputes on every judgment change (`useQuery`'s key includes the whole
 * matrix), the same undebounced, key-driven pattern
 * `app/selecao/page.tsx`'s own `preview` query already uses for a
 * live-computed derived value — each edit here is one discrete `<select>`
 * commit, never a keystroke stream, so there is nothing for a text-input
 * debounce (as used for the free-text search on `app/catalogo/page.tsx`) to
 * usefully coalesce.
 */
export function AhpMatrixInput({ criteria, onDerived }: AhpMatrixInputProps) {
  const [pairs, setPairs] = useState<Record<string, number>>({});

  function setPair(a: string, b: string, value: number) {
    setPairs((current) => ({ ...current, [pairKey(a, b)]: value }));
  }

  const keys = useMemo(() => criteria.map((c) => c.key), [criteria]);
  const ready = keys.length >= 2;

  const matrix = useMemo<number[][]>(
    () =>
      criteria.map((rowC, i) =>
        criteria.map((colC, j) => {
          if (i === j) return 1;
          if (i < j) return pairs[pairKey(rowC.key, colC.key)] ?? 1;
          return 1 / (pairs[pairKey(colC.key, rowC.key)] ?? 1);
        }),
      ),
    [criteria, pairs],
  );

  const query = useQuery<
    Awaited<ReturnType<typeof deriveAhpWeights>>,
    ApiError
  >({
    queryKey: ["ahp-weights", JSON.stringify({ keys, matrix })],
    queryFn: () => deriveAhpWeights({ criteria: keys, matrix }),
    enabled: ready,
    retry: false,
    // Keeps the previous consistency ratio on screen while the next judgment
    // is in flight, same as the constraints-step candidate counter — never
    // shown across an error, since a rejected matrix never reaches `data`.
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    // `query.data` only ever changes reference on a genuinely new successful
    // response (never merely from an unrelated re-render), and never becomes
    // a fresh object on a 400 — so this can only ever forward real weights.
    if (query.data) onDerived(query.data.weights);
  }, [query.data, onDerived]);

  if (!ready) {
    return <p className="text-sm text-ink-muted">{t.needsCriteria}</p>;
  }

  const errorMessage = query.isError
    ? query.error instanceof ApiError
      ? query.error.message
      : ptBR.selection.genericError
    : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">{t.hint}</p>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-1 text-sm">
          <caption className="sr-only">{t.title}</caption>
          <thead>
            <tr>
              <th scope="col" className="p-1" />
              {criteria.map((c) => (
                <th key={c.key} scope="col" className="p-1 text-xs font-medium text-ink-muted">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((rowC, i) => (
              <tr key={rowC.key}>
                <th scope="row" className="p-1 text-left text-xs font-medium text-ink-muted">
                  {rowC.label}
                </th>
                {criteria.map((colC, j) => {
                  if (i === j) {
                    return (
                      <td
                        key={colC.key}
                        className="p-1 text-center tabular-nums text-ink-subtle"
                      >
                        1
                      </td>
                    );
                  }
                  if (i < j) {
                    const value = pairs[pairKey(rowC.key, colC.key)] ?? 1;
                    return (
                      <td key={colC.key} className="p-1">
                        {/* No visible label: the row/column headers already
                            name this cell, per Input's own documented
                            aria-label exception for a control inside a
                            table. */}
                        <Select
                          aria-label={t.pairLabel(rowC.label, colC.label)}
                          className="w-40"
                          value={judgmentKeyFor(value)}
                          onChange={(e) => {
                            const next = VALUE_BY_JUDGMENT_KEY.get(e.target.value) ?? 1;
                            setPair(rowC.key, colC.key, next);
                          }}
                        >
                          {JUDGMENTS.map((j) => (
                            <SelectOption key={j.key} value={j.key}>
                              {j.label}
                            </SelectOption>
                          ))}
                        </Select>
                      </td>
                    );
                  }
                  const reciprocal = 1 / (pairs[pairKey(colC.key, rowC.key)] ?? 1);
                  return (
                    <td
                      key={colC.key}
                      className="p-1 text-center tabular-nums text-ink-subtle"
                    >
                      {formatScore(reciprocal, 3)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {query.isFetching && (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <Spinner /> {t.computing}
        </p>
      )}

      {!query.isFetching && query.data && !query.isError && (
        <p className="text-xs text-ink-muted">
          {t.consistency(formatScore(query.data.consistency_ratio, 2))} —{" "}
          {query.data.consistency_ratio <= CONSISTENCY_THRESHOLD ? t.consistencyOk : t.consistencyBad}
        </p>
      )}

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}
    </div>
  );
}
