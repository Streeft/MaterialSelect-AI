import { describe, expect, it } from "vitest";
import { renderWithQuery as render } from "@/lib/testing/queryWrapper";
import { screen } from "shadow-dom-testing-library";
import { ComparisonView } from "./ComparisonView";
import { ComputedTable } from "./ComputedSection";
import { ptBR } from "@/lib/i18n";
import type { CompareAxis, CompareCell, Comparison } from "@/lib/types";

const t = ptBR.compare;

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

describe("ComparisonView: limiar de destaque (D-128)", () => {
  it("escreve quais propriedades passam do limiar, com a dispersão em pt-BR", () => {
    render(<ComparisonView comparison={comparison()} mode="table" referenceId={1} />);

    expect(screen.getByShadowText(t.threshold.summaryTitle("10", 1))).toBeInTheDocument();
    expect(
      screen.getByShadowText(t.threshold.summaryItem("Densidade", "65,6")),
    ).toBeInTheDocument();
  });

  it("o destaque tem texto, não só cor: selo no cabeçalho e na célula", () => {
    render(<ComparisonView comparison={comparison()} mode="table" referenceId={1} />);

    expect(screen.getAllByShadowText(new RegExp(t.threshold.above)).length).toBeGreaterThan(0);
    expect(screen.getByShadowText(t.threshold.cellAbove)).toBeInTheDocument();
    // E quem não passou também diz que está dentro, em vez de ficar sem marca.
    expect(screen.getByShadowText(new RegExp(t.threshold.below))).toBeInTheDocument();
  });

  it("a ausência da dispersão é escrita com o motivo, não em branco", () => {
    render(<ComparisonView comparison={comparison()} mode="table" />);

    expect(
      screen.getByShadowText(
        new RegExp(`Temperatura de serviço: ${t.threshold.spread.escala_sem_zero}`),
      ),
    ).toBeInTheDocument();
    expect(screen.getByShadowText(t.threshold.unavailable)).toBeInTheDocument();
  });

  it("diz por escrito quando nenhuma propriedade passa", () => {
    const base = comparison();
    render(
      <ComparisonView
        comparison={{
          ...base,
          properties: base.properties.map((p) => ({ ...p, exceeds_threshold: p.spread_pct == null ? null : false })),
        }}
        mode="table"
      />,
    );

    expect(screen.getByShadowText(t.threshold.summaryNone("10"))).toBeInTheDocument();
  });

  it("sem limiar não há resumo nem selo", () => {
    render(
      <ComparisonView
        comparison={comparison({ threshold_pct: null })}
        mode="table"
      />,
    );

    expect(screen.queryByShadowText(t.threshold.summaryTitle("10", 1))).not.toBeInTheDocument();
    expect(screen.queryByShadowText(t.threshold.unavailable)).not.toBeInTheDocument();
  });
});

describe("ComputedTable: propriedades computadas (D-128)", () => {
  const withComputed = comparison({
    computed: [
      {
        name: "E/ρ",
        expression: "modulo_young / densidade",
        goal: "maximize",
        dimension: "meter ** 2 / second ** 2",
        variables: ["densidade", "modulo_young"],
        defined_count: 1,
        undefined_count: 1,
        values: [
          { material_id: 1, value: 25_000_000, undefined_reason: null },
          { material_id: 2, value: null, undefined_reason: "Dados ausentes: modulo_young" },
        ],
      },
    ],
  });

  it("mostra o valor vindo do backend, formatado em pt-BR", () => {
    render(<ComputedTable comparison={withComputed} />);

    expect(screen.getByShadowText("E/ρ")).toBeInTheDocument();
    expect(screen.getByShadowText(/2,5 × 10⁷/)).toBeInTheDocument();
  });

  it("insumo faltando vira ausência escrita com o motivo, nunca zero", () => {
    render(<ComputedTable comparison={withComputed} />);

    expect(
      screen.getByShadowText(`${t.computed.undefinedLabel}: Dados ausentes: modulo_young`),
    ).toBeInTheDocument();
    expect(screen.queryByShadowText("0")).not.toBeInTheDocument();
  });

  it("sem índice escolhido não renderiza tabela", () => {
    const { container } = render(<ComputedTable comparison={comparison()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
