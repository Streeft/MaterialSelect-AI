import type { WeightBudget } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";

const t = ptBR.selection.weights;

/**
 * A weight as typed, read as a number (D-87): blank is `null` — "not typed
 * yet", never zero (D-24) — and anything that is not a number is `"invalid"`,
 * which the field reports in words. The pt-BR comma is accepted.
 *
 * Input parsing, not arithmetic: the total, the shares and the suggestions all
 * come from the backend.
 */
export function parseWeightInput(raw: string): number | null | "invalid" {
  const text = raw.trim();
  if (text === "") return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : "invalid";
}

export interface WeightsGateInput {
  /** Criterion rows on screen, blank ones included. */
  criteriaCount: number;
  /** The budget on screen is not yet the one for what is typed now. */
  pending: boolean;
  /** The preview request failed (network, or an API that has not been deployed). */
  failed: boolean;
  budget: WeightBudget | null;
}

export interface WeightsGate {
  canRun: boolean;
  /** Why "Executar" is disabled, in words — never a dead button (D-86). */
  reason: string | null;
  /** Said beside an enabled button: the check could not be made. */
  note: string | null;
}

/** The sentence for a budget's total, as the backend measured it. */
export function describeTotal(budget: WeightBudget): string {
  const total = formatNumber(budget.total);
  if (budget.status === "exceeds") return t.totalExceeds(total, formatNumber(budget.excess));
  if (budget.status === "complete") return t.totalComplete(total);
  // The typed weights already reach the limit, but a row has none: "faltam 0"
  // would be true and useless.
  if (budget.remaining <= budget.tolerance) return t.totalWithBlanks(total);
  return t.totalMissing(total, formatNumber(budget.remaining));
}

/**
 * Whether the study may run, reading the backend's `can_run`.
 *
 * **Fails open** on a failed check: the rule "weights close at 1" is an aid at
 * entry, not a guarantee the server needs — `/run` renormalizes whatever it
 * gets — so a class must not be locked out because the preview endpoint was
 * slow, down, or not deployed yet. The note says the check did not happen.
 */
export function weightsGate({ criteriaCount, pending, failed, budget }: WeightsGateInput): WeightsGate {
  if (criteriaCount === 0) return { canRun: true, reason: null, note: null };
  if (failed) return { canRun: true, reason: null, note: t.unavailable };
  if (pending || budget === null) return { canRun: false, reason: t.checking, note: null };
  if (budget.can_run) return { canRun: true, reason: null, note: null };
  // A row that has to be fixed first (no criterion, a repeat) is named before
  // the total: closing the total would not unblock it.
  const rowIssue = budget.rows.find((r) => r.issue !== null && r.issue !== "missing_weight");
  if (rowIssue?.issue) return { canRun: false, reason: t.issues[rowIssue.issue], note: null };
  if (budget.status === "exceeds" || budget.remaining > budget.tolerance)
    return { canRun: false, reason: describeTotal(budget), note: null };
  const blank = budget.rows.find((r) => r.issue !== null);
  return { canRun: false, reason: blank?.issue ? t.issues[blank.issue] : t.blockedRun, note: null };
}
