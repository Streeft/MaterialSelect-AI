import { describe, expect, it } from "vitest";
import type { WeightBudget } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { wizardText } from "@/lib/i18n-selection-wizard";
import { FIELD_IDS, runBlockers } from "./runReadiness";

const t = ptBR.selection;
const open = { canRun: true, reason: null, note: null };
const rows = [
  { id: "criterion-1", key: "densidade", direction: "" as const, weight: "1" },
  { id: "criterion-2", key: "", direction: "" as const, weight: "" },
];

function budget(issue: WeightBudget["rows"][number]["issue"], position = 1): WeightBudget {
  return {
    limit: 1,
    tolerance: 0.001,
    total: 1,
    remaining: 0,
    excess: 0,
    status: "incomplete",
    rows: [
      { position: 0, key: "densidade", weight: 1, share: 1, share_percent: 100, issue: null },
      { position, key: null, weight: null, share: null, share_percent: null, issue },
    ],
    suggestion: null,
    can_run: false,
  };
}

describe("o que falta para executar (D-210)", () => {
  it("is nothing when the weights close and the index is set", () => {
    expect(
      runBlockers({ indexMode: "none", customExpression: "", gate: open, budget: null, criteria: [] }),
    ).toEqual([]);
  });

  it("names an empty custom index and points at its expression", () => {
    const [blocker] = runBlockers({
      indexMode: "custom",
      customExpression: "  ",
      gate: open,
      budget: null,
      criteria: [],
    });
    expect(blocker).toMatchObject({
      reason: wizardText.blockers.indexExpressionMissing,
      target: { step: "objective", fieldId: FIELD_IDS.indexExpression },
      opensIndex: true,
    });
  });

  it("takes a criterion without a key to the criterion field of its row", () => {
    const [blocker] = runBlockers({
      indexMode: "none",
      customExpression: "",
      gate: { canRun: false, reason: t.weights.issues.missing_key, note: null },
      budget: budget("missing_key"),
      criteria: rows,
    });
    expect(blocker?.action).toBe(t.weights.fixWeights);
    expect(blocker?.target).toEqual({ step: "objective", fieldId: FIELD_IDS.criterion("criterion-2") });
  });

  it("takes a missing weight to the weight field of its row", () => {
    const [blocker] = runBlockers({
      indexMode: "none",
      customExpression: "",
      gate: { canRun: false, reason: t.weights.issues.missing_weight, note: null },
      budget: budget("missing_weight"),
      criteria: rows,
    });
    expect(blocker?.target?.fieldId).toBe(FIELD_IDS.weight("criterion-2"));
  });

  it("opens the index block when a criterion names an index that is not there", () => {
    const [blocker] = runBlockers({
      indexMode: "none",
      customExpression: "",
      gate: { canRun: false, reason: t.weights.issues.index_missing, note: null },
      budget: budget("index_missing"),
      criteria: rows,
    });
    expect(blocker).toMatchObject({ opensIndex: true, target: { fieldId: FIELD_IDS.indexBlock } });
  });

  it("offers no field while the check is still running", () => {
    const [blocker] = runBlockers({
      indexMode: "none",
      customExpression: "",
      gate: { canRun: false, reason: t.weights.checking, note: null },
      budget: null,
      criteria: rows,
    });
    expect(blocker).toMatchObject({ reason: t.weights.checking, action: null, target: null });
  });
});
