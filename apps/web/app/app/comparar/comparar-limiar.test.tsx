import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
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
  properties: [
    {
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
      spread_pct: 65.6,
      spread_state: "calculada",
      exceeds_threshold: true,
    },
  ],
  materials: [],
  notes: [],
  threshold_pct: 10,
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
    Promise.resolve([{ id: 1, name: "Aço", class_name: "Metais", class_slug: "metais" }]),
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

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ComparePage />
    </QueryClientProvider>,
  );
}

const lastRequest = () => requests[requests.length - 1];

describe("comparador: limiar e computadas (D-128)", () => {
  beforeEach(() => {
    requests.length = 0;
    evaluate.mockReset();
    window.history.replaceState(null, "", "/app/comparar");
  });

  it("lê o limiar da URL e o envia ao backend", async () => {
    nav.query = "materiais=1&limiar=10";
    mount();

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(lastRequest()?.highlight_threshold_pct).toBe(10);
    expect(screen.getByLabelText(ptBR.compare.threshold.label)).toHaveValue(10);
  });

  it("descarta um limiar inválido da URL: sem destaque, sem conserto", async () => {
    nav.query = "materiais=1&limiar=5000";
    mount();

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(lastRequest()?.highlight_threshold_pct).toBeNull();
  });

  it("aplica um limiar válido, grava na URL e aceita vírgula", async () => {
    nav.query = "materiais=1";
    const user = userEvent.setup();
    mount();

    const field = await screen.findByLabelText(ptBR.compare.threshold.label);
    await user.type(field, "7.5");
    await user.click(screen.getByRole("button", { name: ptBR.compare.threshold.apply }));

    await waitFor(() => expect(lastRequest()?.highlight_threshold_pct).toBe(7.5));
    expect(window.location.search).toContain("limiar=7.5");
  });

  it("recusa um limiar fora da faixa com mensagem e não o envia", async () => {
    nav.query = "materiais=1";
    const user = userEvent.setup();
    mount();

    const field = await screen.findByLabelText(ptBR.compare.threshold.label);
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    const before = requests.length;
    await user.type(field, "0");
    await user.click(screen.getByRole("button", { name: ptBR.compare.threshold.apply }));

    expect(await screen.findByText(ptBR.compare.threshold.invalid)).toBeInTheDocument();
    expect(requests.length).toBe(before);
    expect(window.location.search).not.toContain("limiar");
  });

  it("escolher um índice o manda como expressão para o backend", async () => {
    nav.query = "materiais=1";
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("button", { name: "Rigidez específica" }));

    await waitFor(() =>
      expect(lastRequest()?.computed).toEqual([
        { name: "Rigidez específica", expression: "modulo_young / densidade", goal: "maximize" },
      ]),
    );
  });

  it("um índice digitado vai ao backend como expressão, depois de validado", async () => {
    nav.query = "materiais=1";
    evaluate.mockResolvedValue({ dimension: "meter ** 2 / second ** 2" });
    const user = userEvent.setup();
    mount();

    await user.type(await screen.findByLabelText(ptBR.compare.computed.custom.label), "modulo_young / densidade");
    await user.click(screen.getByRole("button", { name: ptBR.compare.computed.custom.add }));

    await waitFor(() =>
      expect(lastRequest()?.computed).toEqual([{ expression: "modulo_young / densidade" }]),
    );
    expect(evaluate).toHaveBeenCalledWith("modulo_young / densidade", "maximize");
    expect(
      screen.getByRole("button", {
        name: `${ptBR.compare.computed.custom.remove}: modulo_young / densidade`,
      }),
    ).toBeInTheDocument();
  });

  it("expressão recusada não entra na requisição: a tabela segue como estava", async () => {
    nav.query = "materiais=1";
    evaluate.mockRejectedValue(new Error("Variáveis desconhecidas: xyz"));
    const user = userEvent.setup();
    mount();

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    const before = requests.length;
    await user.type(await screen.findByLabelText(ptBR.compare.computed.custom.label), "xyz / densidade");
    await user.click(screen.getByRole("button", { name: ptBR.compare.computed.custom.add }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(requests.length).toBe(before);
    expect(lastRequest()?.computed).toEqual([]);
  });

  it("a mesma expressão do catálogo digitada de novo não duplica a coluna", async () => {
    nav.query = "materiais=1";
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("button", { name: "Rigidez específica" }));
    await user.type(
      screen.getByLabelText(ptBR.compare.computed.custom.label),
      "modulo_young/densidade",
    );
    await user.click(screen.getByRole("button", { name: ptBR.compare.computed.custom.add }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ptBR.compare.computed.custom.duplicate);
    expect(evaluate).not.toHaveBeenCalled();
  });
});
