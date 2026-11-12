import type { WeightBudget, WeightIssue } from "@/lib/types";
import type { WeightsGate } from "@/lib/selection/weightsGate";
import { ptBR } from "@/lib/i18n";
import { wizardText } from "@/lib/i18n-selection-wizard";
import type { FieldTarget, Step } from "./steps/steps";
import type { CriterionRow } from "./wizardState";

const t = ptBR.selection;
const w = wizardText;

/** One thing that keeps "Executar" disabled, and where to fix it (D-210). */
export interface RunBlocker {
  id: string;
  reason: string;
  /** The button's words; `null` when there is nothing to go to (a check running). */
  action: string | null;
  target: FieldTarget | null;
  /** The index block folds once confirmed; reaching a field inside it unfolds it. */
  opensIndex?: boolean;
}

export const FIELD_IDS = {
  indexBlock: "selecao-bloco-indice",
  indexExpression: "selecao-indice-expressao",
  criteriaBlock: "selecao-bloco-criterios",
  criterion: (rowId: string) => `selecao-criterio-${rowId}`,
  weight: (rowId: string) => `selecao-peso-${rowId}`,
} as const;

const KEY_ISSUES: ReadonlySet<WeightIssue> = new Set<WeightIssue>([
  "missing_key",
  "duplicate_key",
  "unknown_key",
]);

function issueTarget(
  budget: WeightBudget | null,
  criteria: readonly CriterionRow[],
): { target: FieldTarget; opensIndex: boolean } {
  const objective: Step = "objective";
  const row = budget?.rows.find((r) => r.issue !== null);
  const criterion = row ? criteria[row.position] : undefined;
  if (row?.issue === "index_missing") {
    return { target: { step: objective, fieldId: FIELD_IDS.indexBlock }, opensIndex: true };
  }
  if (!row || !criterion) {
    return { target: { step: objective, fieldId: FIELD_IDS.criteriaBlock }, opensIndex: false };
  }
  const fieldId =
    row.issue !== null && KEY_ISSUES.has(row.issue)
      ? FIELD_IDS.criterion(criterion.id)
      : FIELD_IDS.weight(criterion.id);
  return { target: { step: objective, fieldId }, opensIndex: false };
}

/**
 * What keeps the study from running, in words and with the field (D-210,
 * after D-86's "never a dead button"). Pure: the weights' verdict is the
 * backend's (`weightsGate` reads `can_run`), this only says where to go.
 */
export function runBlockers(input: {
  indexMode: string;
  customExpression: string;
  gate: WeightsGate;
  budget: WeightBudget | null;
  criteria: readonly CriterionRow[];
}): RunBlocker[] {
  const blockers: RunBlocker[] = [];
  if (input.indexMode === "custom" && input.customExpression.trim() === "") {
    blockers.push({
      id: "index-expression",
      reason: w.blockers.indexExpressionMissing,
      action: w.blockers.goToField,
      target: { step: "objective", fieldId: FIELD_IDS.indexExpression },
      opensIndex: true,
    });
  }
  if (!input.gate.canRun && input.gate.reason) {
    const checking = input.gate.reason === t.weights.checking;
    const { target, opensIndex } = issueTarget(input.budget, input.criteria);
    blockers.push({
      id: "weights",
      reason: input.gate.reason,
      action: checking ? null : t.weights.fixWeights,
      target: checking ? null : target,
      opensIndex,
    });
  }
  return blockers;
}
