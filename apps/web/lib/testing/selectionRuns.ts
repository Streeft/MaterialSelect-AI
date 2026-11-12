import type { RunResult } from "@/lib/types";

/**
 * A ranked run of three candidates for the D-210 tests: a winner, a candidate
 * whose index is undefined, and one the ranking excluded for missing data.
 * Fictitious names and numbers — test data, not catalogue data.
 */
export function rankedRun(overrides: Partial<RunResult> = {}): RunResult {
  return {
    universe: "material",
    initial_count: 10,
    combinator: "AND",
    final_count: 3,
    funnel: [
      { label: "Densidade existe", operator: "exists", passed: 6, remaining: 6 },
      { label: "Módulo de Young existe", operator: "exists", passed: 3, remaining: 3 },
    ],
    stages: [],
    candidates: [
      { record_id: 1, name: "Alumínio", class_name: "Metais", index_value: 3.2, score: 0.9, rank: 1 },
      { record_id: 2, name: "Aço", class_name: "Metais", index_value: null, score: 0.4, rank: 2 },
      { record_id: 3, name: "Madeira", class_name: "Naturais", index_value: 2.1, score: null, rank: null },
    ],
    index: {
      name: "Viga leve",
      expression: "sqrt(modulo_young) / densidade",
      goal: "maximize",
      dimension: "dimensionless",
      variables: ["modulo_young", "densidade"],
      values: [
        { record_id: 1, name: "Alumínio", class_name: "Metais", value: 3.2, undefined_reason: null },
        { record_id: 2, name: "Aço", class_name: "Metais", value: null, undefined_reason: "falta densidade" },
        { record_id: 3, name: "Madeira", class_name: "Naturais", value: 2.1, undefined_reason: null },
      ],
      defined_count: 2,
      undefined_count: 1,
    },
    ranking: {
      normalization: "minmax",
      method: "weighted_sum",
      criteria: ["__index__", "custo_massa"],
      ranked: [
        {
          record_id: 1,
          name: "Alumínio",
          score: 0.9,
          rank: 1,
          contributions: [
            { key: "custo_massa", label: "Custo", raw: 2, normalized: 0.5, weight: 0.4, contribution: 0.2 },
            { key: "__index__", label: "Viga leve", raw: 3.2, normalized: 1, weight: 0.6, contribution: 0.7 },
          ],
        },
        { record_id: 2, name: "Aço", score: 0.4, rank: 2, contributions: [] },
      ],
      excluded: [
        { record_id: 3, name: "Madeira", missing_keys: ["custo_massa"], missing_labels: ["Custo por massa"] },
      ],
      sensitivity: [
        { description: "Custo +20%", weights: {}, top_record_id: 1, top_record_name: "Alumínio", changed: false },
      ],
    },
    winner: {
      kind: "ranked",
      names: ["Alumínio"],
      reason: null,
      score: 0.9,
      method: "weighted_sum",
      contributions: [],
      index_value: 3.2,
      value: null,
      maximize: null,
    },
    ...overrides,
  };
}
