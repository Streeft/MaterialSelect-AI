import { describe, expect, it } from "vitest";
import type { RunResult } from "@/lib/types";
import { candidatesTsv } from "./copyTable";

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    universe: "material",
    initial_count: 3,
    combinator: "AND",
    final_count: 3,
    funnel: [],
    candidates: [
      { record_id: 1, name: "Liga A", class_name: "Metais", index_value: 25.4, score: 0.9123, rank: 1 },
      { record_id: 2, name: "=Liga B", class_name: "Metais", index_value: null, score: null, rank: null },
    ],
    stages: [],
    index: {
      name: "Rigidez específica",
      expression: "E/rho",
      goal: "maximize",
      dimension: "dimensionless",
      variables: [],
      values: [
        { record_id: 1, name: "Liga A", class_name: "Metais", value: 25.4, undefined_reason: null },
        {
          record_id: 2,
          name: "=Liga B",
          class_name: "Metais",
          value: null,
          undefined_reason: "sem densidade cadastrada",
        },
      ],
      defined_count: 1,
      undefined_count: 1,
    },
    ranking: {
      normalization: "minmax",
      method: "weighted_sum",
      criteria: [],
      ranked: [],
      excluded: [],
      sensitivity: [],
    },
    ...overrides,
  } as RunResult;
}

describe("candidatesTsv", () => {
  it("writes the table as shown: pt-BR numbers, absence as a word, reason beside it", () => {
    const lines = candidatesTsv(result()).split("\n");
    expect(lines[0]).toBe("Posição\tNome\tClasse\tÍndice\tMotivo da ausência\tEscore");
    expect(lines[1]).toBe("1\tLiga A\tMetais\t25,4\t\t0,912");
    // absence is a written word, never a blank or a zero; the name cannot start a formula
    expect(lines[2]).toBe("Ausente\t'=Liga B\tMetais\tAusente\tsem densidade cadastrada\tAusente");
  });

  it("omits the columns a run without index or ranking does not have", () => {
    const lines = candidatesTsv(result({ index: null, ranking: null })).split("\n");
    expect(lines[0]).toBe("Nome\tClasse");
    expect(lines).toHaveLength(3);
  });
});
