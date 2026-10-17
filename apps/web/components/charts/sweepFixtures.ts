import type { SweepResult, SweepStep } from "@/lib/types";

const rule = {
  key: "volume-linear",
  label: "Regra das misturas por volume",
  formula: "x = f·xA + (1 − f)·xB",
  basis: "exato" as const,
  basis_label: "Exata",
};

function step(position: number, parameter: number, extra: Partial<SweepStep>): SweepStep {
  return {
    position,
    parameter,
    parameters: { fracao_volumetrica: parameter },
    index_value: null,
    index_min: null,
    index_max: null,
    quality: "ESTIMADO",
    values: [],
    ...extra,
  };
}

const base = {
  kind_label: "Compósito de dois constituintes",
  kind_note: "Nota do tipo.",
  parents: ["Fibra de Carbono Demo", "Resina Epóxi Demo"],
  variable: "fracao_volumetrica",
  variable_label: "Fração volumétrica do primeiro constituinte",
  note: "Varrer a espessura absoluta não muda a ordem do ranking; por isso só se varre a receita.",
  properties: [
    { slug: "densidade", name: "Densidade", canonical_unit: "kg/m**3", display_unit: "kg/m³", rule },
  ],
  absent: [],
};

/** Scalar index, one step with no index (position 2): the line must break there. */
export const scalarSweep: SweepResult = {
  ...base,
  kind: "composito",
  spacing: "linear",
  grid: [0.1, 0.3, 0.5, 0.7, 0.9],
  index: { name: "Leveza sob flexão", expression: "E^(1/3)/rho", goal: "maximize", dimension: "m³ᐟ³" },
  steps: [
    step(0, 0.1, { index_value: 1.5 }),
    step(1, 0.3, { index_value: 2.5 }),
    step(3, 0.7, { index_value: 4.5 }),
    step(4, 0.9, { index_value: 5.5 }),
  ],
  skipped: [
    {
      position: 2,
      parameter: 0.5,
      parameters: { fracao_volumetrica: 0.5 },
      reason: "O constituinte não tem o dado necessário.",
    },
  ],
};

/** A composite whose index reads the modulus: the Reuss–Voigt pair, never a mean. */
export const pairSweep: SweepResult = {
  ...scalarSweep,
  index: { name: "Rigidez específica", expression: "E/rho", goal: "maximize", dimension: "" },
  grid: [0.2, 0.5, 0.8],
  steps: [
    step(0, 0.2, { index_min: 10, index_max: 20 }),
    step(1, 0.5, { index_min: 12, index_max: 30 }),
    step(2, 0.8, { index_min: 14, index_max: 40 }),
  ],
  skipped: [],
};

/** Every step lost its index (a panel asked for a strength it does not synthesize). */
export const emptySweep: SweepResult = {
  ...scalarSweep,
  kind: "painel",
  spacing: "log",
  steps: [],
  skipped: [0, 1, 2].map((position) => ({
    position,
    parameter: [1, 2, 4][position]!,
    parameters: { razao_nucleo_face: [1, 2, 4][position]! },
    reason: "A resistência de um painel é uma competição entre modos de falha.",
  })),
  grid: [1, 2, 4],
};
