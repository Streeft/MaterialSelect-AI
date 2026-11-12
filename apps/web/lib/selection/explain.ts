import type { RunResult } from "@/lib/types";
import { formatNumber, formatScore, prettyUnit } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { wizardText } from "@/lib/i18n-selection-wizard";

const t = ptBR.selection;
const w = wizardText.explain;

/**
 * Why a record passed — or fell out of the ranking — in sentences (D-210).
 *
 * Reads the run's own answer and nothing else: the funnel's labels, the
 * stages, the index value or its undefined reason, the rank and score with
 * the contributions, the sensitivity scenarios. No number is computed here —
 * every figure printed is one the backend sent (principle 2, ADR 0004); the
 * only ordering is of the contributions, for display, as the winner card does.
 */
export function explainCandidate(result: RunResult, recordId: number): string[] {
  const candidate = result.candidates.find((c) => c.record_id === recordId);
  if (!candidate) return [];
  const lines: string[] = [];

  lines.push(
    result.funnel.length === 0
      ? w.noLimits
      : w.passedLimits(result.funnel.map((step) => step.label).join("; ")),
  );
  const stages = result.stages.filter((s) => s.enabled);
  if (result.stages.length > 1 && stages.length > 0) {
    lines.push(
      w.passedStages(stages.map((s) => s.label || t.stageNumber(s.position + 1, s.kind)).join(" → ")),
    );
  }

  if (result.index) {
    const name = result.index.name ?? t.customIndex;
    if (candidate.index_value !== null) {
      const unit = prettyUnit(result.index.dimension);
      const value = formatNumber(candidate.index_value);
      lines.push(w.indexValue(name, unit && unit !== "—" ? `${value} ${unit}` : value));
    } else {
      const reason = result.index.values.find((v) => v.record_id === recordId)?.undefined_reason;
      lines.push(reason ? w.indexUndefined(name, reason) : w.indexUndefinedNoReason(name));
    }
  }

  const ranked = result.ranking?.ranked.find((r) => r.record_id === recordId);
  if (result.ranking && ranked) {
    lines.push(w.ranked(ranked.rank, result.ranking.ranked.length, formatScore(ranked.score, 3)));
    const heaviest = [...ranked.contributions]
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map((c) => `${c.label} ${formatScore(c.contribution, 3)}`);
    if (heaviest.length > 0) lines.push(w.heaviest(heaviest.join(" · ")));
  }

  const excluded = result.ranking?.excluded.find((e) => e.record_id === recordId);
  if (excluded) lines.push(w.excluded(excluded.missing_labels.join(", ")));

  if (result.winner.kind !== "none" && result.winner.names.includes(candidate.name)) {
    lines.push(w.winner);
  }

  const topIn = (result.ranking?.sensitivity ?? []).filter((s) => s.top_record_id === recordId);
  if (topIn.length > 0) lines.push(w.sensitivityTop(topIn.map((s) => s.description).join("; ")));

  return lines;
}
