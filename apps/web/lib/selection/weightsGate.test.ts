import { describe, expect, it } from "vitest";
import type { WeightBudget, WeightRow } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeTotal, parseWeightInput, weightsGate } from "./weightsGate";

const t = ptBR.selection.weights;

function row(partial: Partial<WeightRow>): WeightRow {
  return {
    position: 0,
    key: "densidade",
    weight: 0.5,
    share: 0.5,
    share_percent: 50,
    issue: null,
    ...partial,
  };
}

function budget(partial: Partial<WeightBudget>): WeightBudget {
  return {
    limit: 1,
    tolerance: 0.001,
    total: 1,
    remaining: 0,
    excess: 0,
    status: "complete",
    rows: [row({}), row({ position: 1, key: "modulo_young" })],
    suggestion: null,
    can_run: true,
    ...partial,
  };
}

describe("parseWeightInput", () => {
  it("reads blank as not typed, never zero", () => {
    expect(parseWeightInput("")).toBeNull();
    expect(parseWeightInput("   ")).toBeNull();
  });
  it("accepts the pt-BR comma", () => {
    expect(parseWeightInput("0,25")).toBe(0.25);
    expect(parseWeightInput("0.25")).toBe(0.25);
  });
  it("names what is not a number", () => {
    expect(parseWeightInput("abc")).toBe("invalid");
  });
});

describe("weightsGate", () => {
  const base = { criteriaCount: 2, pending: false, failed: false };

  it("lets a study without criteria run", () => {
    expect(weightsGate({ ...base, criteriaCount: 0, budget: null }).canRun).toBe(true);
  });

  it("waits while the check is in flight", () => {
    const gate = weightsGate({ ...base, pending: true, budget: budget({}) });
    expect(gate).toEqual({ canRun: false, reason: t.checking, note: null });
  });

  it("fails open, with a note, when the check cannot be made", () => {
    const gate = weightsGate({ ...base, failed: true, budget: null });
    expect(gate.canRun).toBe(true);
    expect(gate.note).toBe(t.unavailable);
  });

  it("follows the backend's can_run", () => {
    expect(weightsGate({ ...base, budget: budget({}) }).canRun).toBe(true);
  });

  it("says how much is missing", () => {
    const gate = weightsGate({
      ...base,
      budget: budget({ total: 0.8, remaining: 0.2, status: "incomplete", can_run: false }),
    });
    expect(gate.canRun).toBe(false);
    expect(gate.reason).toBe(t.totalMissing("0,8", "0,2"));
  });

  it("says by how much the limit is passed", () => {
    const gate = weightsGate({
      ...base,
      budget: budget({ total: 3, excess: 2, status: "exceeds", can_run: false }),
    });
    expect(gate.reason).toBe(t.totalExceeds("3", "2"));
  });

  it("names a row that must be fixed before the total", () => {
    const gate = weightsGate({
      ...base,
      budget: budget({
        total: 0.5,
        remaining: 0.5,
        status: "incomplete",
        can_run: false,
        rows: [row({}), row({ position: 1, key: null, weight: 0.5, issue: "missing_key" })],
      }),
    });
    expect(gate.reason).toBe(t.issues.missing_key);
  });
});

describe("a total that reaches 1 with a blank row", () => {
  const blanks = budget({
    total: 1,
    remaining: 0,
    status: "incomplete",
    can_run: false,
    rows: [row({ weight: 1 }), row({ position: 1, weight: null, share: null, share_percent: null, issue: "missing_weight" })],
  });
  it("names the blank row, not a missing 0", () => {
    expect(weightsGate({ criteriaCount: 2, pending: false, failed: false, budget: blanks }).reason).toBe(
      t.issues.missing_weight,
    );
    expect(describeTotal(blanks)).toBe(t.totalWithBlanks("1"));
  });
});

describe("describeTotal", () => {
  it("reads a closed total", () => {
    expect(describeTotal(budget({}))).toBe(t.totalComplete("1"));
  });
});
