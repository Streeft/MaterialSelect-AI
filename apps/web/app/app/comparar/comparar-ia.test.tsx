import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { compareViewText } from "@/lib/i18n-compare-view";
import { suggestText } from "@/lib/i18n-suggest";
import { decodeMapState } from "../mapas/url-state";
import type { ComparisonRequest, SuggestionsOut } from "@/lib/types";

vi.mock("react-plotly.js", () => ({ default: () => null }));

const nav = vi.hoisted(() => ({ query: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/comparar",
}));

const requests: ComparisonRequest[] = [];
const suggestNextSteps = vi.fn<(tool: string, context: Record<string, unknown>) => Promise<SuggestionsOut>>();

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  evaluateIndex: vi.fn(),
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: Record<string, unknown>) => suggestNextSteps(tool, context),
  getComparison: (request: ComparisonRequest) => {
    requests.push(request);
    return new Promise(() => {});
  },
  getMyRecords: () => Promise.resolve({ favorites: [], recents: [], own_records: [] }),
  listStudies: () => Promise.resolve([]),
  listMaterials: () =>
    Promise.resolve([
      { id: 1, name: "Aço 1020", class_name: "Metais", class_slug: "metais" },
      { id: 2, name: "Alumínio 6061", class_name: "Metais", class_slug: "metais" },
      { id: 3, name: "Titânio", class_name: "Metais", class_slug: "metais" },
    ]),
  listProperties: () =>
    Promise.resolve([
      { slug: "densidade", name: "Densidade", canonical_unit: "kg/m**3", better_direction: "LOWER", value_count: 9, min_level: 1 },
      { slug: "modulo_young", name: "Módulo de Young", canonical_unit: "Pa", better_direction: "HIGHER", value_count: 9, min_level: 1 },
    ]),
  listPerformanceIndices: () => Promise.resolve([]),
}));

const { default: ComparePage } = await import("./page");

function answer(): SuggestionsOut {
  return {
    tool: "comparar",
    summary: "Dois passos.",
    suggestions: [
      {
        title: "Inclua o titânio",
        body: "Ele fecha o trio de metais leves.",
        actions: [{ type: "compare", label: "Comparar os três", ids: [1, 2, 3] }],
      },
      {
        title: "Veja num mapa",
        body: "Densidade × módulo.",
        actions: [{ type: "set_axes", label: "Abrir no mapa", x: "densidade", y: "modulo_young" }],
      },
    ],
    rejected: [],
    degraded: false,
    cached: false,
    notice: null,
    provider: "mock",
    simulated: true,
    disclaimer: "",
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ComparePage />
    </QueryClientProvider>,
  );
}

describe("comparador — Sugestão da IA (D-229)", () => {
  beforeEach(() => {
    requests.length = 0;
    nav.push.mockReset();
    suggestNextSteps.mockReset();
    suggestNextSteps.mockResolvedValue(answer());
    window.history.replaceState(null, "", "/app/comparar");
  });

  it("sem material o botão está desligado e diz por quê; nada é consultado", async () => {
    nav.query = "";
    mount();
    const button = await screen.findByRole("button", { name: suggestText.button });
    expect(button).toBeDisabled();
    expect(screen.getByText(compareViewText.ai.needMaterials)).toBeInTheDocument();
    expect(suggestNextSteps).not.toHaveBeenCalled();
  });

  it("envia os materiais e as propriedades da tela, e “Comparar os três” troca os materiais", async () => {
    nav.query = "materiais=1,2&propriedades=densidade";
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: suggestText.button }));
    await user.click(await screen.findByRole("button", { name: "Comparar os três" }));
    expect(suggestNextSteps).toHaveBeenCalledWith("comparar", {
      material_ids: [1, 2],
      property_slugs: ["densidade"],
    });
    await waitFor(() => expect(requests.at(-1)?.material_ids).toEqual([1, 2, 3]));
    await waitFor(() => expect(window.location.search).toContain("materiais=1%2C2%2C3"));
  });

  it("“Abrir no mapa” leva os comparados e os eixos ao Mapa, pelo endereço", async () => {
    nav.query = "materiais=1,2&propriedades=densidade";
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: suggestText.button }));
    await user.click(await screen.findByRole("button", { name: "Abrir no mapa" }));
    expect(nav.push).toHaveBeenCalledTimes(1);
    const href = new URL(nav.push.mock.calls[0]?.[0] as string, "http://localhost");
    expect(href.pathname).toBe("/app/mapas");
    expect(href.searchParams.get("materiais")).toBe("1,2");
    const state = decodeMapState(href.searchParams.get("estado") ?? "");
    expect(state?.xAxis?.property).toBe("densidade");
    expect(state?.yAxis?.property).toBe("modulo_young");
  });
});
