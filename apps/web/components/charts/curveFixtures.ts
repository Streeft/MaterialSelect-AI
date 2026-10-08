import type { Curve, CurveAxis, MaterialCurves } from "@/lib/types";

/**
 * A curve as the backend sends it (D-106), for the figure and section tests.
 * Fictitious, like the demo it mirrors: two temperatures, one with a band.
 */
function axis(overrides: Partial<CurveAxis>): CurveAxis {
  return {
    quantity: "tensao",
    quantity_label: "Tensão",
    title: null,
    unit: "MPa",
    unit_label: "MPa",
    canonical_unit: "Pa",
    original_unit: "MPa",
    conversion_method: "pint:MPa->Pa",
    accepted_units: [
      { unit: "MPa", label: "MPa" },
      { unit: "GPa", label: "GPa" },
    ],
    log: false,
    log_refusal: null,
    domain: [0, 420],
    ...overrides,
  };
}

export const stressStrain: Curve = {
  id: 11,
  material_id: 2,
  material_name: "Aço Demo B",
  kind: "TENSAO_DEFORMACAO",
  kind_label: "Tensão–deformação",
  title: "Tração em duas temperaturas (fictícia)",
  description: null,
  scale: "linear",
  available_scales: ["linear", "log-x", "log-y", "log-log"],
  x_axis: axis({
    quantity: "deformacao",
    quantity_label: "Deformação",
    title: "Deformação de engenharia",
    unit: "%",
    unit_label: "%",
    canonical_unit: "dimensionless",
    original_unit: "%",
    conversion_method: "pint:%->dimensionless",
    accepted_units: [
      { unit: "%", label: "%" },
      { unit: "dimensionless", label: "adimensional" },
    ],
    domain: [0, 5.2],
  }),
  y_axis: axis({ title: "Tensão de engenharia" }),
  parameter: { quantity: "temperatura", quantity_label: "Temperatura", unit: "degC", unit_label: "°C" },
  series: [
    {
      id: 101,
      position: 0,
      label: null,
      conditions: "Ar ambiente (fictício).",
      parameter_value: 20,
      parameter_original: 20,
      parameter_original_unit: "degC",
      path: [
        [0, 0],
        [0.1, 205],
        [5, 400],
      ],
      band: null,
      points: [
        { position: 0, x: 0, y: 0, y_min: null, y_max: null, x_original: 0, y_original: 0, y_min_original: null, y_max_original: null, drawn: true },
        { position: 1, x: 0.1, y: 205, y_min: null, y_max: null, x_original: 0.1, y_original: 205, y_min_original: null, y_max_original: null, drawn: true },
        { position: 2, x: 5, y: 400, y_min: null, y_max: null, x_original: 5, y_original: 400, y_min_original: null, y_max_original: null, drawn: true },
      ],
      excluded: 0,
    },
    {
      id: 102,
      position: 1,
      label: null,
      conditions: null,
      parameter_value: 300,
      parameter_original: 300,
      parameter_original_unit: "degC",
      path: [
        [0, 0],
        [0.1, 185],
        [5, 330],
      ],
      band: [
        [0.1, 175],
        [5, 310],
        [5, 350],
        [0.1, 195],
      ],
      points: [
        { position: 0, x: 0, y: 0, y_min: null, y_max: null, x_original: 0, y_original: 0, y_min_original: null, y_max_original: null, drawn: true },
        { position: 1, x: 0.1, y: 185, y_min: 175, y_max: 195, x_original: 0.1, y_original: 185, y_min_original: 175, y_max_original: 195, drawn: true },
        { position: 2, x: 5, y: 330, y_min: 310, y_max: 350, x_original: 5, y_original: 330, y_min_original: 310, y_max_original: 350, drawn: true },
      ],
      excluded: 0,
    },
  ],
  notes: [],
  source_label: "Dataset Demo MaterialSelect",
  citation: "Curva fictícia de demonstração — não é dado de ensaio.",
  data_quality: "ESTIMADO",
  is_demo: true,
  is_own_record: false,
};

export const curveList: MaterialCurves = {
  material_id: 2,
  material_name: "Aço Demo B",
  total: 1,
  counts_by_kind: [
    { kind: "TENSAO_DEFORMACAO", label: "Tensão–deformação", count: 1 },
    { kind: "TEMPERATURA", label: "Dependência da temperatura", count: 0 },
    { kind: "TAXA", label: "Dependência da taxa de deformação", count: 0 },
    { kind: "FADIGA", label: "Fadiga (S–N)", count: 0 },
    { kind: "FLUENCIA", label: "Fluência", count: 0 },
  ],
  curves: [
    {
      id: 11,
      kind: "TENSAO_DEFORMACAO",
      kind_label: "Tensão–deformação",
      title: stressStrain.title,
      x_quantity: "deformacao",
      x_quantity_label: "Deformação de engenharia",
      y_quantity: "tensao",
      y_quantity_label: "Tensão de engenharia",
      parameter_quantity_label: "Temperatura",
      series_count: 2,
      point_count: 6,
      source_label: "Dataset Demo MaterialSelect",
      is_demo: true,
    },
  ],
};

export const emptyCurveList: MaterialCurves = {
  ...curveList,
  total: 0,
  counts_by_kind: curveList.counts_by_kind.map((c) => ({ ...c, count: 0 })),
  curves: [],
};
