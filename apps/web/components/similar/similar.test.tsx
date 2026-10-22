import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MaterialDetail, PropertyDefinition, Similar } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";

const t = ptBR.similar;

const properties: PropertyDefinition[] = [
  {
    display_unit: null,
    id: 1,
    name: "Densidade",
    slug: "densidade",
    symbol: "ρ",
    description: null,
    category: "FISICA",
    physical_dimension: "[mass] / [length] ** 3",
    canonical_unit: "kg/m**3",
    accepted_units: ["kg/m**3"],
    is_interval: false,
    better_direction: "LOWER",
    allows_log_scale: true,
    value_count: 5,
  },
  {
    display_unit: null,
    id: 2,
    name: "Módulo de Young",
    slug: "modulo_young",
    symbol: "E",
    description: null,
    category: "MECANICA",
    physical_dimension: "[mass] / [length] / [time] ** 2",
    canonical_unit: "Pa",
    accepted_units: ["Pa"],
    is_interval: false,
    better_direction: "HIGHER",
    allows_log_scale: true,
    value_count: 5,
  },
];

const material = {
  id: 1,
  name: "Aço",
  class_id: 1,
  class_name: "Metais",
  class_slug: "metais",
  subclass: null,
  description: null,
  is_demo: false,
  is_active: true,
  is_own_record: false,
  keywords: [],
  processes: [],
  designations: [],
  composition: [],
  property_groups: [
    {
      category: "FISICA",
      properties: [
        {
          display_unit: null,
          display_value: null,
          display_min: null,
          display_max: null,
          display_typical: null,
          display_uncertainty: null,
          property_slug: "densidade",
          property_name: "Densidade",
          symbol: "ρ",
          category: "FISICA",
          is_missing: false,
          is_interval: false,
          value_scalar: 7850,
          value_min: null,
          value_max: null,
          value_typical: null,
          original_unit: "kg/m**3",
          normalized_value: 7850,
          canonical_unit: "kg/m**3",
          conversion_method: null,
          uncertainty: null,
          measurement_condition: null,
          notes: null,
          data_quality: "MEDIDO",
          source_label: null,
        },
      ],
    },
  ],
} satisfies MaterialDetail;

const answer: Similar = {
  reference_id: 1,
  reference_name: "Aço",
  basis: ["densidade"],
  basis_labels: ["Densidade"],
  neighbours: [
    {
      record_id: 2,
      name: "Alumínio",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: false,
      is_own_record: false,
      distance: 0.12,
      rank: 1,
      contributions: { densidade: 0.0144 },
      satisfied: ["densidade"],
      within_tolerance: [],
      tolerance_matches: null,
    },
  ],
  excluded: [
    {
      record_id: 3,
      name: "Sem dados",
      missing_slugs: ["densidade"],
      missing_labels: ["Densidade"],
    },
  ],
  degenerate: [],
  degenerate_labels: [],
  linear_fallback: ["densidade"],
  linear_fallback_labels: ["Densidade"],
  weights: { densidade: 2 },
  criteria: { densidade: "at_most" },
  tolerance_pct: null,
  tolerance_bands: [],
};

/** The same answer, asked with ±10% over a two-property basis (D-155). */
const withTolerance: Similar = {
  ...answer,
  basis: ["densidade", "temp_fusao"],
  basis_labels: ["Densidade", "Temperatura de fusão"],
  neighbours: [
    {
      record_id: 2,
      name: "Alumínio",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: false,
      is_own_record: false,
      distance: 0,
      rank: 1,
      contributions: { densidade: 0, temp_fusao: 0.3 },
      satisfied: [],
      within_tolerance: ["densidade"],
      tolerance_matches: 1,
    },
    {
      record_id: 4,
      name: "Chumbo",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: false,
      is_own_record: false,
      distance: 0.5,
      rank: 2,
      contributions: { densidade: 0.25, temp_fusao: 0.25 },
      satisfied: [],
      within_tolerance: [],
      tolerance_matches: 0,
    },
  ],
  linear_fallback: [],
  linear_fallback_labels: [],
  tolerance_pct: 10,
  tolerance_bands: [
    {
      slug: "densidade",
      label: "Densidade",
      low: 7065,
      high: 8635,
      unit: "kg/m³",
      applicable: true,
      tolerance_pct: 10,
    },
    {
      slug: "temp_fusao",
      label: "Temperatura de fusão",
      low: null,
      high: null,
      unit: "°C",
      applicable: false,
      tolerance_pct: 10,
    },
  ],
};

/**
 * Only density asked its own ±5%, with no global tolerance (D-158): the
 * melting point has no band and must say so in words.
 */
const perProperty: Similar = {
  ...withTolerance,
  tolerance_pct: null,
  tolerance_bands: [
    {
      slug: "densidade",
      label: "Densidade",
      low: 7457.5,
      high: 8242.5,
      unit: "kg/m³",
      applicable: true,
      tolerance_pct: 5,
    },
  ],
};

const replace = vi.fn();
let search = new URLSearchParams(
  "sim_peso=densidade:2&sim_criterio=densidade:menor",
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/app/materiais/1",
  useSearchParams: () => search,
}));

const findSimilar = vi.fn(() => Promise.resolve(answer));

vi.mock("@/lib/api", () => ({
  listProperties: () => Promise.resolve(properties),
  findSimilar: (...args: unknown[]) => findSimilar(...(args as [])),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { SimilarPanel } = await import("./SimilarPanel");

describe("materiais semelhantes", () => {
  it("propõe uma base a partir do que a ficha tem, sem escolhê-la calada", async () => {
    // A interface propõe; a requisição declara. As marcas ficam visíveis para o
    // leitor ver que a pergunta foi montada — e poder desmontá-la.
    render(wrap(<SimilarPanel material={material} />));

    const densidade = await screen.findByShadowRole("checkbox", {
      name: "Densidade",
    });
    expect(densidade).toBeChecked();
  });

  it("recusa a busca sem base, com o motivo escrito", async () => {
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("checkbox", { name: "Densidade" }),
    );

    expect(await screen.findByShadowText(t.basisEmpty)).toBeInTheDocument();
  });

  it("mostra a base em que a resposta foi medida", async () => {
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("button", { name: t.search }),
    );

    expect(await screen.findByShadowText(t.basisUsed)).toBeInTheDocument();
  });

  it("lista os vizinhos em ordem, com a distância", async () => {
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("button", { name: t.search }),
    );

    expect(
      await screen.findByShadowRole("link", { name: "Alumínio" }),
    ).toBeInTheDocument();
  });

  it("nomeia quem ficou de fora e o que lhe faltava", async () => {
    // A lista mais curta *e* a razão de ser mais curta.
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("button", { name: t.search }),
    );

    expect(await screen.findByShadowText(t.excludedTitle)).toBeInTheDocument();
    expect(await screen.findByShadowText(/Sem dados/)).toBeInTheDocument();
  });

  it("avisa quando a escala logarítmica caiu para linear", async () => {
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("button", { name: t.search }),
    );

    expect(await screen.findByShadowText(t.linearTitle)).toBeInTheDocument();
  });

  it("diz que a distância só se compara dentro desta resposta", async () => {
    // Sem isso o número é lido como medida absoluta, que ele não é.
    render(wrap(<SimilarPanel material={material} />));

    expect(await screen.findByShadowText(t.distanceHint)).toBeInTheDocument();
  });

  it("manda peso e critério da URL na requisição (D-120)", async () => {
    const user = userEvent.setup();
    findSimilar.mockClear();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("button", { name: t.search }),
    );

    expect(findSimilar).toHaveBeenCalledWith(
      1,
      {
        property_slugs: ["densidade"],
        limit: 10,
        weights: { densidade: 2 },
        criteria: { densidade: "at_most" },
      },
      undefined,
    );
  });

  it("mostra os controles de peso e critério com nome acessível", async () => {
    render(wrap(<SimilarPanel material={material} />));

    const weight = await screen.findByShadowRole("combobox", {
      name: t.weightLabel("Densidade"),
    });
    expect(weight).toHaveValue("2");
    const criterion = screen.getByShadowRole("combobox", {
      name: t.criterionLabel("Densidade"),
    });
    expect(criterion).toHaveValue("at_most");
  });

  it("grava a mudança de critério na URL", async () => {
    const user = userEvent.setup();
    replace.mockClear();
    render(wrap(<SimilarPanel material={material} />));

    const criterion = await screen.findByShadowRole("combobox", {
      name: t.criterionLabel("Densidade"),
    });
    await user.selectOptions(criterion, "at_least");

    expect(replace).toHaveBeenCalledWith(
      "/app/materiais/1?sim_peso=densidade%3A2&sim_criterio=densidade%3Amaior",
      { scroll: false },
    );
  });

  it("explica a posição por propriedade e marca o 100% do critério", async () => {
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("button", { name: t.search }),
    );

    expect(await screen.findByShadowText(t.satisfiedTag)).toBeInTheDocument();
  });

  it("sem ajustes na URL, a requisição não leva peso nem critério", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams();
    findSimilar.mockClear();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("button", { name: t.search }),
    );

    expect(findSimilar).toHaveBeenCalledWith(
      1,
      {
        property_slugs: ["densidade"],
        limit: 10,
        weights: {},
        criteria: {},
      },
      undefined,
    );
  });

  it("manda a tolerância da URL e a unidade de leitura na requisição (D-155)", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams("sim_tolerancia=2.5");
    findSimilar.mockClear();
    render(
      wrap(
        <SimilarPanel material={material} unitChoices={{ densidade: "g/cm**3" }} />,
      ),
    );

    const field = await screen.findByShadowRole("textbox", {
      name: t.toleranceLabel,
    });
    expect(field).toHaveValue("2,5");
    await user.click(screen.getByShadowRole("button", { name: t.search }));

    expect(findSimilar).toHaveBeenCalledWith(
      1,
      {
        property_slugs: ["densidade"],
        limit: 10,
        weights: {},
        criteria: {},
        tolerance_pct: 2.5,
      },
      { densidade: "g/cm**3" },
    );
  });

  it("grava a tolerância digitada com vírgula na URL", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams();
    replace.mockClear();
    render(wrap(<SimilarPanel material={material} />));

    const field = await screen.findByShadowRole("textbox", {
      name: t.toleranceLabel,
    });
    await user.type(field, "7,5");

    expect(replace).toHaveBeenLastCalledWith(
      "/app/materiais/1?sim_tolerancia=7.5",
      { scroll: false },
    );
  });

  it("recusa tolerância inválida com o motivo escrito e sem buscar", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams();
    findSimilar.mockClear();
    render(wrap(<SimilarPanel material={material} />));

    const field = await screen.findByShadowRole("textbox", {
      name: t.toleranceLabel,
    });
    await user.type(field, "150");

    expect(await screen.findByShadowText(t.toleranceInvalid)).toBeInTheDocument();
    expect(screen.getByShadowRole("button", { name: t.search })).toBeDisabled();
  });

  it("mostra a faixa, quem está dentro dela por escrito e a tabela de origem, e passa no axe", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams("sim_tolerancia=10");
    findSimilar.mockImplementationOnce(() => Promise.resolve(withTolerance));
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("button", { name: t.search }),
    );

    expect(
      await screen.findByShadowText(t.toleranceTitle("10")),
    ).toBeInTheDocument();
    expect(
      screen.getByShadowText(/de 7\.065 a 8\.635 kg\/m³/),
    ).toBeInTheDocument();
    // A escala sem zero real não ganha faixa — e isso está escrito.
    expect(
      screen.getByShadowText(new RegExp(t.toleranceNotApplicable)),
    ).toBeInTheDocument();
    const table = screen.getByShadowRole("table", {
      name: t.toleranceTableCaption,
    });
    expect(table).toHaveTextContent(t.toleranceInside);
    expect(table).toHaveTextContent(t.toleranceOutside);
    expect(table).toHaveTextContent(t.toleranceNoBand);
    expect(table).toHaveTextContent(t.toleranceMatches(1, 1));
    expect(table).toHaveTextContent(t.toleranceMatches(0, 1));
    expect(
      screen.getByShadowText(t.toleranceSummary(1, 1)),
    ).toBeInTheDocument();
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("manda a tolerância de cada propriedade da URL, só da base (D-158)", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams(
      "sim_tolerancia=10&sim_tolerancia_prop=densidade:2.5,modulo_young:3",
    );
    findSimilar.mockClear();
    render(wrap(<SimilarPanel material={material} />));

    const field = await screen.findByShadowRole("textbox", {
      name: t.propertyToleranceLabel("Densidade"),
    });
    expect(field).toHaveValue("2,5");
    await user.click(screen.getByShadowRole("button", { name: t.search }));

    // modulo_young is not in the basis: the server would refuse it (422).
    expect(findSimilar).toHaveBeenCalledWith(
      1,
      {
        property_slugs: ["densidade"],
        limit: 10,
        weights: {},
        criteria: {},
        tolerance_pct: 10,
        tolerances: { densidade: 2.5 },
      },
      undefined,
    );
  });

  it("grava a tolerância de uma propriedade digitada com vírgula na URL", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams();
    replace.mockClear();
    render(wrap(<SimilarPanel material={material} />));

    const field = await screen.findByShadowRole("textbox", {
      name: t.propertyToleranceLabel("Densidade"),
    });
    await user.type(field, "7,5");

    expect(replace).toHaveBeenLastCalledWith(
      "/app/materiais/1?sim_tolerancia_prop=densidade%3A7.5",
      { scroll: false },
    );
  });

  it("recusa tolerância de propriedade inválida com o motivo escrito e sem buscar", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams();
    replace.mockClear();
    render(wrap(<SimilarPanel material={material} />));

    const field = await screen.findByShadowRole("textbox", {
      name: t.propertyToleranceLabel("Densidade"),
    });
    await user.type(field, "0");

    expect(
      await screen.findByShadowText(t.propertyToleranceInvalid("Densidade")),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByShadowRole("button", { name: t.search })).toBeDisabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("mostra o percentual de cada faixa, a propriedade sem tolerância por escrito e a tabela de origem, e passa no axe", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams("sim_tolerancia_prop=densidade:5");
    findSimilar.mockImplementationOnce(() => Promise.resolve(perProperty));
    render(wrap(<SimilarPanel material={material} />));

    await user.click(
      await screen.findByShadowRole("button", { name: t.search }),
    );

    expect(
      await screen.findByShadowText(t.toleranceTitlePerProperty),
    ).toBeInTheDocument();
    expect(
      screen.getByShadowText(/Densidade \(±5%\): de 7\.457,5 a 8\.242,5 kg\/m³/),
    ).toBeInTheDocument();
    // Nobody asked a band for the melting point, and that is written.
    const noneAsked = t.toleranceNoneAsked.replace(/[()]/g, "\\$&");
    expect(
      screen.getByShadowText(new RegExp(`^${noneAsked} Temperatura de fusão$`)),
    ).toBeInTheDocument();
    const table = screen.getByShadowRole("table", {
      name: t.toleranceTableCaption,
    });
    expect(table).toHaveTextContent(t.toleranceBandLabel("Densidade", "5"));
    expect(table).toHaveTextContent(t.toleranceInside);
    expect(table).toHaveTextContent(t.toleranceOutside);
    expect(table).not.toHaveTextContent("Temperatura de fusão");
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("materiais semelhantes: nível de profundidade (D-165)", () => {
  it("no Nível 1 não oferece a base de nível maior, mas mantém a já escolhida", async () => {
    const extra = {
      ...properties[0]!,
      id: 9,
      name: "Limite de fadiga",
      slug: "fadiga",
      min_level: 3,
    } as PropertyDefinition;
    const other = { ...extra, id: 10, name: "Tenacidade", slug: "tenacidade" } as PropertyDefinition;
    properties.push(extra, other);
    const before = search;
    search = new URLSearchParams("nivel=1");
    try {
      render(wrap(<SimilarPanel material={material} />));
      expect(await screen.findByShadowRole("checkbox", { name: "Densidade" })).toBeChecked();
      expect(screen.queryByShadowRole("checkbox", { name: "Limite de fadiga" })).toBeNull();
      expect(screen.queryByShadowRole("checkbox", { name: "Tenacidade" })).toBeNull();
      expect(
        screen.getByShadowText(new RegExp("O Nível 1 oferece 2 de 4 grandezas como base da busca")),
      ).toBeInTheDocument();
    } finally {
      properties.splice(2, 2);
      search = before;
    }
  });
});

