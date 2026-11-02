import { describe, expect, it, vi } from "vitest";
import { renderWithQuery as render } from "@/lib/testing/queryWrapper";
import { screen } from "shadow-dom-testing-library";
import { ComparisonView } from "./ComparisonView";
import { ComputedTable } from "./ComputedSection";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { CompareAxis, CompareCell, Comparison } from "@/lib/types";

const t = ptBR.compare;

// D-191: the table reads a typed index by its friendly description.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  describeExpression: async (expression: string) => ({
    expression,
    valid: true,
    normalized: expression,
    latex: "\\frac{\\text{Módulo de Young}}{\\text{Densidade}}",
    latex_symbols: "\\frac{E}{\\rho}",
    label: "Módulo de Young / Densidade",
    dimension: "dimensionless",
    unit: "dimensionless",
    is_multiplicative: true,
    variables: [
      { variable: "modulo_young", slug: "modulo_young", name: "Módulo de Young", symbol: "E", symbol_latex: "E", unit: "Pa", display_unit: null, category: "MECANICA", description: null },
      { variable: "densidade", slug: "densidade", name: "Densidade", symbol: "ρ", symbol_latex: "\\rho", unit: "kg/m**3", display_unit: null, category: "FISICA", description: null },
    ],
    errors: [],
    tree: null,
  }),
}));

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
        spread_pct: 40,
        spread_state: "calculada",
        exceeds_threshold: true,
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

  it("coluna adimensional não escreve colchetes com traço depois do nome", () => {
    const dimensionless = comparison({
      computed: [{ ...withComputed.computed![0]!, dimension: "dimensionless" }],
    });
    render(<ComputedTable comparison={dimensionless} />);

    expect(screen.getByShadowText("E/ρ")).toBeInTheDocument();
    expect(screen.queryByShadowText(/\[—\]/)).not.toBeInTheDocument();
  });

  it("sem índice escolhido não renderiza tabela", () => {
    const { container } = render(<ComputedTable comparison={comparison()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("diz 'Calculada' por escrito, com ícone, e a nota do que é calculado", async () => {
    render(<ComputedTable comparison={withComputed} />);

    expect(screen.getByShadowText(t.computed.badge)).toBeInTheDocument();
    expect(screen.getByShadowText(t.computed.note)).toBeInTheDocument();
    // D-191: the inputs are read by name, never by the grammar's slug.
    expect(
      await screen.findByShadowText(new RegExp(t.computed.inputs("Módulo de Young, Densidade"))),
    ).toBeInTheDocument();
  });

  it("a dispersão da coluna e o selo de limiar são texto, não só cor", () => {
    render(<ComputedTable comparison={withComputed} />);

    expect(screen.getByShadowText(/Acima do limiar · Dispersão 40%/)).toBeInTheDocument();
  });

  it("sem limiar mostra a dispersão sem veredito; sem dispersão escreve o motivo", () => {
    const base = withComputed.computed![0]!;
    const { rerender } = render(
      <ComputedTable
        comparison={{
          ...withComputed,
          threshold_pct: null,
          computed: [{ ...base, exceeds_threshold: null }],
        }}
      />,
    );
    expect(screen.getByShadowText("Dispersão 40%")).toBeInTheDocument();
    expect(screen.queryByShadowText(/Acima do limiar/)).not.toBeInTheDocument();

    rerender(
      <ComputedTable
        comparison={{
          ...withComputed,
          computed: [
            { ...base, spread_pct: null, spread_state: "escala_sem_zero", exceeds_threshold: null },
          ],
        }}
      />,
    );
    expect(
      screen.getByShadowText(`${t.threshold.unavailable}: ${t.threshold.spread.escala_sem_zero}`),
    ).toBeInTheDocument();
  });

  it("um índice digitado é lido pelo nome e pela fórmula, nunca pela gramática (D-191)", async () => {
    const typed = comparison({
      computed: [
        { ...withComputed.computed![0]!, name: "Módulo de Young / Densidade" },
      ],
    });
    const { container } = render(<ComputedTable comparison={typed} />);

    expect(screen.getByShadowText("Módulo de Young / Densidade")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Módulo de Young / Densidade" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent("modulo_young / densidade");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
