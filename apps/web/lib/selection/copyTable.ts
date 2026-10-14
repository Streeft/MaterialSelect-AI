import type { RunResult } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { flowText } from "@/lib/i18n-flow";
import { formatNumber, formatScore, prettyUnit } from "@/lib/format";
import { toTsv } from "@/lib/clipboard";

const c = flowText.copy;

/**
 * The candidates/ranking table of a run as TSV (D-122) — the same rows, in the
 * same order, with the same formatting as the table on screen. A candidate with
 * no index value or no score gets the written word "Ausente" (and the backend's
 * reason, when it gave one), never a blank cell and never a zero.
 */
export function candidatesTsv(result: RunResult): string {
  const { candidates, index, ranking } = result;
  const reasons = new Map(
    index?.values.filter((v) => v.value === null).map((v) => [v.record_id, v.undefined_reason]) ?? [],
  );
  const dimension =
    index?.dimension && index.dimension !== "dimensionless" ? ` [${prettyUnit(index.dimension)}]` : "";
  const header = [
    ...(ranking ? [c.columnRank] : []),
    c.columnName,
    c.columnClass,
    ...(index ? [`${c.columnIndex}${dimension}`, c.columnReason] : []),
    ...(ranking ? [c.columnScore] : []),
  ];
  const rows = candidates.map((cand) => [
    ...(ranking ? [cand.rank === null ? ptBR.quality.AUSENTE : String(cand.rank)] : []),
    cand.name,
    cand.class_name,
    ...(index
      ? [
          cand.index_value === null ? ptBR.quality.AUSENTE : formatNumber(cand.index_value),
          cand.index_value === null ? (reasons.get(cand.record_id) ?? "") : "",
        ]
      : []),
    ...(ranking
      ? [cand.score === null ? ptBR.quality.AUSENTE : formatScore(cand.score, 3)]
      : []),
  ]);
  return toTsv(header, rows);
}
