import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { expressionText } from "@/lib/i18n-expression";
import { compareLinkText } from "@/lib/i18n-compare-link";
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
  // D-191: the calculator's palette and the friendly reading of an index.
  getExpressionPalette: () =>
    Promise.resolve({ universe: "material", variables: [], functions: [], constants: [] }),
  describeExpression: (expression: string) =>
    Promise.resolve({
      expression,
      valid: true,
      normalized: expression,
      latex: expression,
      latex_symbols: expression,
      label: expression.replace("modulo_young", "Módulo de Young").replace("densidade", "Densidade"),
      dimension: "dimensionless",
      unit: "dimensionless",
      is_multiplicative: true,
      variables: [],
      errors: [],
      tree: null,
    }),
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

describe("comparador: o link leva limiar e índices (D-163)", () => {
  beforeEach(() => {
    requests.length = 0;
    evaluate.mockReset();
    window.history.replaceState(null, "", "/app/comparar");
  });

  it("um índice digitado que vem no link é conferido no servidor e entra no pedido", async () => {
    nav.query = "materiais=1&limiar=10&indice=modulo_young%20%2F%20densidade";
    evaluate.mockResolvedValue({ dimension: "meter ** 2 / second ** 2" });
    mount();

    await waitFor(() =>
      expect(lastRequest()?.computed).toEqual([{ expression: "modulo_young / densidade" }]),
    );
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledWith("modulo_young / densidade", "maximize");
    expect(lastRequest()?.highlight_threshold_pct).toBe(10);
    // The very first request already carries it: the table is never asked for
    // without the index and then again with it.
    expect(requests.every((r) => (r.computed ?? []).length === 1)).toBe(true);
    expect(
      await screen.findByRole("button", {
        name: `${ptBR.compare.computed.custom.remove}: Módulo de Young / Densidade`,
      }),
    ).toBeInTheDocument();
  });

  it("expressão do link que o servidor recusa fica de fora, escrita, e some do endereço", async () => {
    nav.query = "materiais=1&indice=xyz%20%2F%20densidade";
    evaluate.mockRejectedValue(new ApiError("Variáveis desconhecidas: xyz", 400));
    mount();

    expect(
      await screen.findByText(
        compareLinkText.refused("xyz / densidade", "Variáveis desconhecidas: xyz"),
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(lastRequest()?.computed).toEqual([]);
    await waitFor(() => expect(writtenLink().searchParams.has("indice")).toBe(false));
  });

  it("servidor fora do ar não faz a expressão passar: diz que não pôde conferir", async () => {
    nav.query = "materiais=1&indice=a%20%2F%20b";
    evaluate.mockRejectedValue(new Error("rede"));
    mount();

    expect(
      await screen.findByText(compareLinkText.refused("a / b", compareLinkText.unverified)),
    ).toBeInTheDocument();
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(lastRequest()?.computed).toEqual([]);
  });

  it("índice do catálogo no link entra no pedido; slug que não existe mais é dito", async () => {
    nav.query = "materiais=1&calculadas=rigidez-especifica,sumiu";
    mount();

    await waitFor(() =>
      expect(lastRequest()?.computed).toEqual([
        { name: "Rigidez específica", expression: "modulo_young / densidade", goal: "maximize" },
      ]),
    );
    expect(await screen.findByText(compareLinkText.unknownCatalogue("sumiu"))).toBeInTheDocument();
  });

  it("o endereço passa a levar materiais, limiar e índices à medida que mudam", async () => {
    nav.query = "materiais=1,2";
    evaluate.mockResolvedValue({ dimension: "x" });
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("button", { name: "Rigidez específica" }));
    await user.click(screen.getByRole("button", { name: expressionText.modeType }));
    await user.type(
      screen.getByLabelText(ptBR.compare.computed.custom.label),
      "sqrt(modulo_young) / densidade",
    );
    await user.click(screen.getByRole("button", { name: ptBR.compare.computed.custom.add }));
    await user.type(screen.getByLabelText(ptBR.compare.threshold.label), "7.5");
    await user.click(screen.getByRole("button", { name: ptBR.compare.threshold.apply }));

    await waitFor(() => expect(writtenLink().searchParams.get("limiar")).toBe("7.5"));
    const link = writtenLink().searchParams;
    expect(link.get("materiais")).toBe("1,2");
    expect(link.get("calculadas")).toBe("rigidez-especifica");
    expect(link.getAll("indice")).toEqual(["sqrt(modulo_young) / densidade"]);
    // Typed on the screen, accepted once: no second call to the validator.
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("tirar o limiar ou o índice tira do endereço", async () => {
    nav.query = "materiais=1&limiar=10&indice=a%20%2F%20b";
    evaluate.mockResolvedValue({ dimension: "x" });
    const user = userEvent.setup();
    mount();

    await user.click(
      await screen.findByRole("button", {
        name: `${ptBR.compare.computed.custom.remove}: a / b`,
      }),
    );
    await user.click(screen.getByRole("button", { name: ptBR.compare.threshold.clear }));

    await waitFor(() => expect(writtenLink().searchParams.has("limiar")).toBe(false));
    expect(writtenLink().searchParams.has("indice")).toBe(false);
    expect(writtenLink().searchParams.get("materiais")).toBe("1");
  });

  it("Copiar link entrega o endereço completo e diz que copiou", async () => {
    nav.query = "materiais=1&limiar=10&indice=a%20%2F%20b";
    evaluate.mockResolvedValue({ dimension: "x" });
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount();

    await user.click(await screen.findByRole("button", { name: compareLinkText.copy }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = new URL(writeText.mock.calls[0]?.[0] as string);
    expect(copied.pathname).toBe("/app/comparar");
    expect(copied.searchParams.get("materiais")).toBe("1");
    expect(copied.searchParams.get("limiar")).toBe("10");
    expect(copied.searchParams.getAll("indice")).toEqual(["a / b"]);
    expect(await screen.findByText(compareLinkText.done)).toBeInTheDocument();
  });

  it("sem material não há o que copiar: o botão não aparece", async () => {
    nav.query = "";
    mount();

    await screen.findByText(ptBR.compare.title);
    expect(screen.queryByRole("button", { name: compareLinkText.copy })).not.toBeInTheDocument();
  });

  it("sem violação de acessibilidade com o aviso do link e o botão", async () => {
    nav.query = "materiais=1&limiar=10&indice=xyz";
    evaluate.mockRejectedValue(new ApiError("Variáveis desconhecidas: xyz", 400));
    const { container } = mount();

    await screen.findByText(compareLinkText.refused("xyz", "Variáveis desconhecidas: xyz"));
    const violations = await findA11yViolations(container);
    expect(describeViolations(violations)).toBe("");
  });
});
