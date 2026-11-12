import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { compareViewText } from "@/lib/i18n-compare-view";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { ComparisonRequest } from "@/lib/types";

vi.mock("react-plotly.js", () => ({ default: () => null }));

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/comparar",
}));

const requests: ComparisonRequest[] = [];
const bookmark = (id: number, name: string) => ({
  universe: "material",
  at: "2026-11-01T10:00:00Z",
  material: { id, name, class_name: "Metais", class_slug: "metais" },
  process: null,
});

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  evaluateIndex: vi.fn(),
  getComparison: (request: ComparisonRequest) => {
    requests.push(request);
    return new Promise(() => {});
  },
  getMyRecords: () =>
    Promise.resolve({
      favorites: [bookmark(1, "Aço 1020"), bookmark(2, "Alumínio 6061")],
      recents: [],
      own_records: [],
    }),
  listMaterials: () =>
    Promise.resolve([
      { id: 1, name: "Aço 1020", class_name: "Metais", class_slug: "metais" },
      { id: 2, name: "Alumínio 6061", class_name: "Metais", class_slug: "metais" },
    ]),
  listProperties: () =>
    Promise.resolve([
      {
        slug: "densidade",
        name: "Densidade",
        canonical_unit: "kg/m**3",
        better_direction: "LOWER",
        value_count: 9,
        min_level: 1,
      },
    ]),
  listPerformanceIndices: () => Promise.resolve([]),
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

describe("comparador: estado vazio e visão no link (D-214)", () => {
  beforeEach(() => {
    requests.length = 0;
    window.history.replaceState(null, "", "/app/comparar");
  });

  it("sem materiais explica o que fazer e oferece os favoritos", async () => {
    nav.query = "";
    const { container } = mount();
    expect(
      await screen.findByRole("heading", { name: compareViewText.empty.title }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: compareViewText.empty.compareAll(2, compareViewText.empty.whatFavorites) }),
    ).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("um clique em 'comparar os favoritos' enche o passo 1 e a comparação sai", async () => {
    nav.query = "";
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: compareViewText.empty.compareAll(2, compareViewText.empty.whatFavorites),
      }),
    );
    const chosen = await screen.findByRole("list", { name: "Materiais escolhidos" });
    expect(chosen).toHaveTextContent("Aço 1020");
    expect(chosen).toHaveTextContent("Alumínio 6061");
    // The empty state leaves once there is something to compare, and the address follows.
    expect(screen.queryByRole("heading", { name: compareViewText.empty.title })).toBeNull();
    await waitFor(() => expect(window.location.search).toContain("materiais=1%2C2"));
    await waitFor(() => expect(requests.at(-1)?.material_ids).toEqual([1, 2]));
  });

  it("com um só material avisa que falta mais um", async () => {
    nav.query = "materiais=1";
    mount();
    expect(await screen.findByText(compareViewText.empty.needMore)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: compareViewText.empty.title })).toBeNull();
  });

  it("a visão e o 'só diferenças' do link abrem ligados, e trocar de visão reescreve o endereço", async () => {
    nav.query = "materiais=1,2&propriedades=densidade&visao=heatmap&diferencas=1";
    mount();
    const tab = await screen.findByRole("tab", { name: "Heatmap" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(window.location.search).toContain("visao=heatmap"));
    expect(window.location.search).toContain("diferencas=1");

    fireEvent.click(screen.getByRole("tab", { name: "Tabela" }));
    await waitFor(() => expect(window.location.search).not.toContain("visao="));
  });
});

describe("comparador: pares clássicos como ponto de partida (D-220)", () => {
  beforeEach(() => {
    requests.length = 0;
    nav.query = "";
    window.history.replaceState(null, "", "/app/comparar");
  });

  it("oferece o par que o catálogo tem, e um clique compara os dois", async () => {
    mount();
    const pair = await screen.findByRole("button", {
      name: compareViewText.empty.comparePair("Aço 1020", "Alumínio 6061"),
    });
    expect(pair).toHaveTextContent("Aço × Alumínio");
    // A pair the catalogue cannot answer is not offered.
    expect(screen.queryByText(/PEAD × PP/)).toBeNull();
    fireEvent.click(pair);
    await waitFor(() => expect(requests.at(-1)?.material_ids).toEqual([1, 2]));
  });
});
