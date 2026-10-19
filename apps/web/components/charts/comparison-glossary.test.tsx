import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithQuery as render } from "@/lib/testing/queryWrapper";
import { screen } from "shadow-dom-testing-library";
import { ComparisonView } from "./ComparisonView";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";
import type { CompareAxis, CompareCell, Comparison, GlossaryEntry } from "@/lib/types";

const t = ptBR.glossary;

const entry = (slug: string): GlossaryEntry => ({
  slug,
  summary: `Resumo de ${slug}.`,
  definition: "Definição.",
  how_measured: null,
  reference: null,
  license: "Texto autoral do projeto MaterialSelect AI.",
  review_status: "rascunho",
  lang: "pt-BR",
});
// Only two of the three compared properties have an entry.
const listGlossary = vi.fn((): Promise<GlossaryEntry[]> =>
  Promise.resolve([entry("densidade"), entry("calor")]),
);
vi.mock("@/lib/api", () => ({ listGlossary: () => listGlossary() }));

function axis(overrides: Partial<CompareAxis>): CompareAxis {
  return {
    property_slug: "densidade",
    property_name: "Densidade",
    symbol: "ρ",
    unit: "kg/m**3",
    category: "FISICA",
    better_direction: "LOWER",
    allows_log_scale: true,
    min_value: 2700,
    max_value: 7850,
    present_count: 2,
    missing_material_ids: [],
    ...overrides,
  };
}

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
    conversion_method: "pint",
    uncertainty: null,
    data_quality: "MEDIDO",
    difference_pct: null,
    difference_state: "sem_referencia",
    source_label: "Fonte",
    measurement_condition: null,
    display_unit: null,
    display_value: null,
    display_min: null,
    display_max: null,
    display_uncertainty: null,
    ...overrides,
  };
}

function comparison(overrides: Partial<Comparison> = {}): Comparison {
  return {
    normalization: "minmax",
    properties: [
      axis({ spread_pct: 65.6, spread_state: "calculada", exceeds_threshold: true }),
      axis({
        property_slug: "calor",
        property_name: "Calor específico",
        spread_pct: 4,
        spread_state: "calculada",
        exceeds_threshold: false,
      }),
      axis({
        property_slug: "temp",
        property_name: "Temperatura de serviço",
        spread_pct: null,
        spread_state: "escala_sem_zero",
        exceeds_threshold: null,
      }),
    ],
    materials: [
      {
        material_id: 1,
        name: "Aço",
        class_name: "Metais",
        class_slug: "metais",
        is_demo: true,
        cells: [cell(), cell({ property_slug: "calor" }), cell({ property_slug: "temp" })],
        complete: true,
      },
      {
        material_id: 2,
        name: "Alumínio",
        class_name: "Metais",
        class_slug: "metais",
        is_demo: true,
        cells: [
          cell({ difference_state: "calculada", difference_pct: -65.6, exceeds_threshold: true }),
          cell({ property_slug: "calor" }),
          cell({ property_slug: "temp" }),
        ],
        complete: true,
      },
    ],
    notes: [],
    threshold_pct: 10,
    computed: [],
    ...overrides,
  };
}

describe("ComparisonView: dica do glossário no cabeçalho (GL-b)", () => {
  it("põe a dica só nas propriedades com verbete, com uma requisição", async () => {
    listGlossary.mockClear();
    render(<ComparisonView comparison={comparison()} mode="table" />);
    expect(await screen.findByShadowRole("button", { name: t.hintLabel("Densidade") })).toBeInTheDocument();
    expect(screen.getByShadowRole("button", { name: t.hintLabel("Calor específico") })).toBeInTheDocument();
    await waitFor(() => expect(listGlossary).toHaveBeenCalledTimes(1));
    expect(screen.queryByShadowRole("button", { name: t.hintLabel("Temperatura de serviço") })).not.toBeInTheDocument();
    expect(screen.queryByShadowText(t.missing)).not.toBeInTheDocument();
  });

  it("a tabela continua legível com as dicas e passa no axe", async () => {
    const { container } = render(<ComparisonView comparison={comparison()} mode="table" />);
    await screen.findByShadowRole("button", { name: t.hintLabel("Densidade") });
    expect(screen.getByShadowRole("columnheader", { name: /Temperatura de serviço/ })).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
