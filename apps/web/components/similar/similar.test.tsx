import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MaterialDetail, PropertyDefinition, Similar } from "@/lib/types";
import { ptBR } from "@/lib/i18n";

const t = ptBR.similar;

const properties: PropertyDefinition[] = [
  {
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
  property_groups: [
    {
      category: "FISICA",
      properties: [
        {
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
    },
  ],
  excluded: [
    { record_id: 3, name: "Sem dados", missing_slugs: ["densidade"], missing_labels: ["Densidade"] },
  ],
  degenerate: [],
  degenerate_labels: [],
  linear_fallback: ["densidade"],
  linear_fallback_labels: ["Densidade"],
};

const findSimilar = vi.fn(() => Promise.resolve(answer));

vi.mock("@/lib/api", () => ({
  listProperties: () => Promise.resolve(properties),
  findSimilar: (...args: unknown[]) => findSimilar(...(args as [])),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { SimilarPanel } = await import("./SimilarPanel");

describe("materiais semelhantes", () => {
  it("propõe uma base a partir do que a ficha tem, sem escolhê-la calada", async () => {
    // A interface propõe; a requisição declara. As marcas ficam visíveis para o
    // leitor ver que a pergunta foi montada — e poder desmontá-la.
    render(wrap(<SimilarPanel material={material} />));

    const densidade = await screen.findByShadowRole("checkbox", { name: "Densidade" });
    expect(densidade).toBeChecked();
  });

  it("recusa a busca sem base, com o motivo escrito", async () => {
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(await screen.findByShadowRole("checkbox", { name: "Densidade" }));

    expect(await screen.findByShadowText(t.basisEmpty)).toBeInTheDocument();
  });

  it("mostra a base em que a resposta foi medida", async () => {
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(await screen.findByShadowRole("button", { name: t.search }));

    expect(await screen.findByShadowText(t.basisUsed)).toBeInTheDocument();
  });

  it("lista os vizinhos em ordem, com a distância", async () => {
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(await screen.findByShadowRole("button", { name: t.search }));

    expect(await screen.findByShadowRole("link", { name: "Alumínio" })).toBeInTheDocument();
  });

  it("nomeia quem ficou de fora e o que lhe faltava", async () => {
    // A lista mais curta *e* a razão de ser mais curta.
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(await screen.findByShadowRole("button", { name: t.search }));

    expect(await screen.findByShadowText(t.excludedTitle)).toBeInTheDocument();
    expect(await screen.findByShadowText(/Sem dados/)).toBeInTheDocument();
  });

  it("avisa quando a escala logarítmica caiu para linear", async () => {
    const user = userEvent.setup();
    render(wrap(<SimilarPanel material={material} />));

    await user.click(await screen.findByShadowRole("button", { name: t.search }));

    expect(await screen.findByShadowText(t.linearTitle)).toBeInTheDocument();
  });

  it("diz que a distância só se compara dentro desta resposta", async () => {
    // Sem isso o número é lido como medida absoluta, que ele não é.
    render(wrap(<SimilarPanel material={material} />));

    expect(await screen.findByShadowText(t.distanceHint)).toBeInTheDocument();
  });
});
