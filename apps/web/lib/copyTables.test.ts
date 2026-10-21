import { describe, expect, it } from "vitest";
import type { CompareCell, Comparison, PropertyGroup, PropertyValueOut } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { copyTablesText as c } from "@/lib/i18n-copy-tables";
import { comparisonTsv, funnelTsv, sheetTsv } from "./copyTables";

function cell(overrides: Partial<CompareCell> = {}): CompareCell {
  return {
    property_slug: "densidade",
    is_missing: false,
    value: 7850,
    normalized: 0.5,
    value_min: null,
    value_max: null,
    original_value: 7850,
    original_unit: "kg/m**3",
    conversion_method: null,
    uncertainty: null,
    data_quality: "MEDIDO",
    difference_pct: null,
    difference_state: "sem_referencia",
    source_label: null,
    measurement_condition: null,
    display_unit: null,
    display_value: null,
    display_min: null,
    display_max: null,
    display_uncertainty: null,
    ...overrides,
  } as CompareCell;
}

const comparison = {
  normalization: "minmax",
  properties: [
    { property_slug: "densidade", property_name: "Densidade", unit: "kg/m**3" },
    { property_slug: "calor", property_name: "Calor específico", unit: "J/(kg*K)" },
  ],
  materials: [
    {
      material_id: 1,
      name: "Aço",
      class_name: "Metais",
      class_slug: "metais",
      cells: [cell({ difference_state: "referencia" }), cell({ property_slug: "calor", value: 500 })],
      complete: true,
    },
    {
      material_id: 2,
      name: "=Liga",
      class_name: "Metais",
      class_slug: "metais",
      cells: [
        cell({ value: 2700, difference_state: "calculada", difference_pct: -65.6 }),
        cell({ property_slug: "calor", is_missing: true, value: null, difference_state: "valor_ausente" }),
      ],
      complete: false,
    },
  ],
  notes: [],
  threshold_pct: null,
  computed: [],
} as unknown as Comparison;

describe("comparisonTsv (D-161)", () => {
  it("escreve a ausência, nunca célula vazia nem zero", () => {
    const lines = comparisonTsv(comparison, null).split("\n");
    expect(lines[0]).toContain("Densidade [");
    expect(lines[2]).toContain(ptBR.quality.AUSENTE);
    for (const line of lines) for (const field of line.split("\t")) expect(field).not.toBe("");
    expect(lines[2]?.split("\t")).not.toContain("0");
  });

  it("neutraliza fórmula no nome, como a tabela exportada", () => {
    expect(comparisonTsv(comparison, null).split("\n")[2]?.startsWith("'=Liga")).toBe(true);
  });

  it("com referência traz a diferença em pt-BR ou o motivo escrito", () => {
    const lines = comparisonTsv(comparison, 1).split("\n");
    expect(lines[0]?.split("\t")).toContain(`Densidade ${c.comparison.difference}`);
    expect(lines[2]).toContain("-65,6%");
    expect(lines[2]).toContain(ptBR.compare.difference.valor_ausente);
    for (const line of lines) for (const field of line.split("\t")) expect(field).not.toBe("");
  });
});

describe("funnelTsv (D-161)", () => {
  it("lista o inicial e o que cada estágio tirou; o que não se aplica é escrito", () => {
    const tsv = funnelTsv(10, [
      { label: "Densidade < 3000", operator: "lt", passed: 6, remaining: 6 },
      { label: "Nível ≥ 2", operator: "level", passed: 4, remaining: 4, without_level: 2 },
    ]);
    const rows = tsv.split("\n").map((l) => l.split("\t"));
    expect(rows[1]).toEqual([c.funnel.initial, "10", ...Array(3).fill(c.funnel.notApplicable)]);
    expect(rows[2]).toEqual(["Densidade < 3000", "6", "4", c.funnel.notApplicable, c.funnel.notApplicable]);
    expect(rows[3]).toEqual(["Nível ≥ 2", "4", "2", c.funnel.notApplicable, "2"]);
  });
});

function prop(overrides: Partial<PropertyValueOut>): PropertyValueOut {
  return {
    property_slug: "densidade",
    property_name: "Densidade",
    symbol: null,
    category: "FISICA",
    is_missing: false,
    is_interval: false,
    value_scalar: 7.85,
    value_min: null,
    value_max: null,
    value_typical: null,
    original_unit: "g/cm**3",
    normalized_value: 7850,
    canonical_unit: "kg/m**3",
    conversion_method: null,
    uncertainty: null,
    measurement_condition: null,
    notes: null,
    data_quality: "MEDIDO",
    source_label: "Handbook",
    display_unit: null,
    display_value: null,
    display_min: null,
    display_max: null,
    display_typical: null,
    display_uncertainty: null,
    ...overrides,
  };
}

describe("sheetTsv (D-161)", () => {
  const groups: PropertyGroup[] = [
    {
      category: "FISICA",
      properties: [
        prop({}),
        prop({
          property_slug: "e",
          property_name: "Módulo",
          is_interval: true,
          value_scalar: null,
          value_min: 190,
          value_max: 210,
          value_typical: 200,
          source_label: null,
        }),
        prop({ property_slug: "k", property_name: "Condutividade", is_missing: true, value_scalar: null, data_quality: "MEDIDO" }),
      ],
    },
  ];

  it("escreve valor, intervalo com típico, fonte ausente e propriedade ausente", () => {
    const rows = sheetTsv(groups).split("\n").map((l) => l.split("\t"));
    expect(rows[1]?.slice(1, 3)).toEqual(["Densidade", "7,85"]);
    expect(rows[2]?.[2]).toBe(`190 – 210 (${c.sheet.typical}: 200)`);
    expect(rows[2]?.[5]).toBe(c.sheet.noSource);
    expect(rows[3]?.slice(2, 5)).toEqual([ptBR.quality.AUSENTE, ptBR.quality.AUSENTE, ptBR.quality.AUSENTE]);
    for (const row of rows) for (const field of row) expect(field).not.toBe("");
  });
});
