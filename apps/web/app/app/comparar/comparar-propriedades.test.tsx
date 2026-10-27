import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { compareLinkText } from "@/lib/i18n-compare-link";
import { MAX_COMPARE_PROPERTIES } from "@/lib/compareLimits";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { Comparison, ComparisonRequest } from "@/lib/types";

vi.mock("react-plotly.js", () => ({ default: () => null }));

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/comparar",
}));

const requests: ComparisonRequest[] = [];
const result: Comparison = {
  normalization: "minmax",
  properties: [],
  materials: [],
  notes: [],
  threshold_pct: null,
  computed: [],
};

const evaluate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  },
  evaluateIndex: evaluate,
  getComparison: (request: ComparisonRequest) => {
    requests.push(request);
    return Promise.resolve(result);
  },
  listMaterials: () =>
    Promise.resolve([
      { id: 1, name: "Aço", class_name: "Metais", class_slug: "metais" },
      { id: 2, name: "Alumínio", class_name: "Metais", class_slug: "metais" },
    ]),
  listProperties: () =>
    Promise.resolve([
      {
        slug: "densidade",
        name: "Densidade",
        canonical_unit: "kg/m**3",
        better_direction: "LOWER",
        value_count: 2,
      },
      {
        slug: "modulo_young",
        name: "Módulo de Young",
        canonical_unit: "Pa",
        better_direction: "HIGHER",
        value_count: 1,
      },
    ]),
  listPerformanceIndices: () =>
    Promise.resolve([
      {
        id: 1,
        name: "Rigidez específica",
        slug: "rigidez-especifica",
        expression: "modulo_young / densidade",
        goal: "maximize",
        description: null,
        assumptions: null,
        dimension: null,
        is_demo: true,
      },
    ]),
}));

const { default: ComparePage } = await import("./page");
const { ApiError } = await import("@/lib/api");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ComparePage />
    </QueryClientProvider>,
  );
}

const lastRequest = () => requests[requests.length - 1];

/** The address the page wrote, as the next reader would receive it. */
function writtenLink() {
  return new URL(window.location.href);
}

describe("comparador: o link leva propriedades e normalização (D-174)", () => {
  beforeEach(() => {
    requests.length = 0;
    evaluate.mockReset();
    window.history.replaceState(null, "", "/app/comparar");
  });

  it("abre com as propriedades e a normalização do link, na ordem dada", async () => {
    nav.query = "materiais=1,2&propriedades=modulo_young,densidade&normalizacao=vector";
    mount();

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(lastRequest()?.property_slugs).toEqual(["modulo_young", "densidade"]);
    expect(lastRequest()?.normalization).toBe("vector");
    // Never asked first with the default and then again: the first request is already it.
    expect(requests.every((r) => r.normalization === "vector")).toBe(true);
    expect(requests.every((r) => r.property_slugs.join() === "modulo_young,densidade")).toBe(true);
    expect(screen.getByLabelText(ptBR.compare.normalization)).toHaveValue("vector");
    expect(screen.getByRole("button", { name: "Módulo de Young" })).toHaveAttribute("aria-pressed", "true");
  });

  it("propriedade que não existe, pedaço malformado e normalização inválida são ditos e saem do pedido e do endereço", async () => {
    nav.query = "materiais=1&propriedades=densidade,sumiu,%3Cb%3E&normalizacao=zscore";
    mount();

    expect(await screen.findByText(compareLinkText.unknownProperty("sumiu"))).toBeInTheDocument();
    expect(screen.getByText(compareLinkText.badProperty("<b>"))).toBeInTheDocument();
    expect(
      screen.getByText(compareLinkText.badNormalization("zscore", ptBR.compare.normMinmax)),
    ).toBeInTheDocument();
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(lastRequest()?.property_slugs).toEqual(["densidade"]);
    expect(lastRequest()?.normalization).toBe("minmax");
    await waitFor(() => expect(writtenLink().searchParams.get("propriedades")).toBe("densidade"));
    expect(writtenLink().searchParams.has("normalizacao")).toBe(false);
  });

  it("propriedades acima do teto: as primeiras ficam e o resto é dito", async () => {
    const many = Array.from({ length: MAX_COMPARE_PROPERTIES + 2 }, (_, i) => `x${i}`);
    nav.query = `materiais=1&propriedades=densidade,${many.join(",")}`;
    mount();

    expect(
      await screen.findByText(compareLinkText.tooManyProperties(3, MAX_COMPARE_PROPERTIES)),
    ).toBeInTheDocument();
  });

  it("sem escolha no link, o endereço passa a levar as propriedades que a tela mostra; mudar atualiza", async () => {
    nav.query = "materiais=1,2";
    const user = userEvent.setup();
    mount();

    await waitFor(() =>
      expect(writtenLink().searchParams.get("propriedades")).toBe("densidade,modulo_young"),
    );
    expect(writtenLink().searchParams.has("normalizacao")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Módulo de Young" }));
    await waitFor(() => expect(writtenLink().searchParams.get("propriedades")).toBe("densidade"));

    await user.selectOptions(screen.getByLabelText(ptBR.compare.normalization), "vector");
    await waitFor(() => expect(writtenLink().searchParams.get("normalizacao")).toBe("vector"));
  });

  it("Copiar link entrega as propriedades e a normalização", async () => {
    nav.query = "materiais=1&propriedades=modulo_young&normalizacao=vector";
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount();

    await user.click(await screen.findByRole("button", { name: compareLinkText.copy }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = new URL(writeText.mock.calls[0]?.[0] as string).searchParams;
    expect(copied.get("propriedades")).toBe("modulo_young");
    expect(copied.get("normalizacao")).toBe("vector");
  });

  it("sem violação de acessibilidade com o aviso do que ficou de fora", async () => {
    nav.query = "materiais=1&propriedades=densidade,sumiu&normalizacao=zscore";
    const { container } = mount();

    await screen.findByText(compareLinkText.unknownProperty("sumiu"));
    const violations = await findA11yViolations(container);
    expect(describeViolations(violations)).toBe("");
  });
});
