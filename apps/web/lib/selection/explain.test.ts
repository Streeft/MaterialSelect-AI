import { describe, expect, it } from "vitest";
import { wizardText } from "@/lib/i18n-selection-wizard";
import { explainCandidate } from "./explain";
import { rankedRun } from "@/lib/testing/selectionRuns";

const w = wizardText.explain;

describe("explicação por material (D-210)", () => {
  it("says the winner passed every limit, its index, rank, heaviest criteria and sensitivity", () => {
    const lines = explainCandidate(rankedRun(), 1);
    expect(lines).toEqual([
      w.passedLimits("Densidade existe; Módulo de Young existe"),
      w.indexValue("Viga leve", "3,2"),
      w.ranked(1, 2, "0,900"),
      // The contributions, ordered for display only — the numbers are the backend's.
      w.heaviest("Viga leve 0,700 · Custo 0,200"),
      w.winner,
      w.sensitivityTop("Custo +20%"),
    ]);
  });

  it("gives the backend's reason when the index is undefined", () => {
    expect(explainCandidate(rankedRun(), 2)).toContain(w.indexUndefined("Viga leve", "falta densidade"));
  });

  it("says a candidate fell out of the ranking for missing data, by name of the data", () => {
    const lines = explainCandidate(rankedRun(), 3);
    expect(lines).toContain(w.excluded("Custo por massa"));
    expect(lines.some((l) => l.startsWith("Posição"))).toBe(false);
  });

  it("says the whole catalogue continues when no limit was set", () => {
    expect(explainCandidate(rankedRun({ funnel: [] }), 1)[0]).toBe(w.noLimits);
  });

  it("explains nobody who is not a candidate", () => {
    expect(explainCandidate(rankedRun(), 99)).toEqual([]);
  });
});
