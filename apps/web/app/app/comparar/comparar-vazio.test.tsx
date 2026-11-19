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

// D-250: the last kept run the shortcut reads (null when none was kept).
const runs = vi.hoisted(() => ({ latest: vi.fn() }));
const entry = (record_id: number, rank: number | null) => ({
  record_id,
  name: `Material ${record_id}`,
  class_name: "Metais",
  rank,
  score: null,
  index_value: null,
});
const latestRun = (top: ReturnType<typeof entry>[], gone = 0) => ({
  study_id: 7,
  study_name: "Viga leve",
  run: {
    id: 3,
    study_id: 7,
    label: null,
    universe: "material",
    initial_count: 9,
    final_count: top.length,
    winner_names: [],
    created_at: "2026-11-10T10:00:00Z",
  },
  top,
  gone,
});
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
  getLatestSelectionRun: (n?: number) => runs.latest(n),
  listMaterials: () =>
    Promise.resolve([
      { id: 1, name: "Aço 1020", class_name: "Metais", class_slug: "metais" },
      { id: 2, name: "Alumínio 6061", class_name: "Metais", class_slug: "metais" },
      { id: 3, name: "Titânio Ti-6Al-4V", class_name: "Metais", class_slug: "metais" },
      { id: 4, name: "PEEK", class_name: "Polímeros", class_slug: "polimeros" },
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

describe("comparador: pares clássicos como ponto de partida (D-221)", () => {
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

describe("comparador: último estudo executado (D-250)", () => {
  beforeEach(() => {
    requests.length = 0;
    nav.query = "";
    window.history.replaceState(null, "", "/app/comparar");
    runs.latest.mockReset();
  });

  it("sem execução guardada explica como guardar uma e leva à Seleção", async () => {
    runs.latest.mockResolvedValue(null);
    const { container } = mount();
    expect(await screen.findByText(compareViewText.empty.noRunTitle)).toBeInTheDocument();
    expect(screen.getByText(compareViewText.empty.noRunBody)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: compareViewText.empty.openSelection })).toHaveAttribute(
      "href",
      "/app/selecao",
    );
    expect(screen.queryByRole("button", { name: /top do estudo/i })).toBeNull();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("leva ao comparador os primeiros da última execução, na ordem que o servidor mandou", async () => {
    runs.latest.mockResolvedValue(latestRun([entry(3, 1), entry(1, 2), entry(4, 3), entry(2, null)]));
    mount();
    const button = await screen.findByRole("button", {
      name: compareViewText.empty.compareStudyTop("Viga leve"),
    });
    expect(runs.latest).toHaveBeenCalledWith(5);
    fireEvent.click(button);
    // Nothing is run again and nothing is reordered here: the server's order.
    await waitFor(() => expect(requests.at(-1)?.material_ids).toEqual([3, 1, 4, 2]));
    expect(screen.queryByRole("heading", { name: compareViewText.empty.title })).toBeNull();
  });

  it("diz quantos candidatos saíram do catálogo desde a execução", async () => {
    runs.latest.mockResolvedValue(latestRun([entry(3, 2), entry(1, 3)], 1));
    mount();
    expect(await screen.findByText(compareViewText.empty.lastStudyGone(1))).toBeInTheDocument();
  });

  it("uma execução com menos de dois candidatos diz isso, em vez de comparar um só", async () => {
    runs.latest.mockResolvedValue(latestRun([entry(1, 1)]));
    mount();
    expect(await screen.findByText(compareViewText.empty.studyTooFew("Viga leve"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /top do estudo/i })).toBeNull();
  });

  it("um erro ao ler a execução aparece no cartão, com tentar de novo", async () => {
    runs.latest.mockRejectedValueOnce(new Error("falhou")).mockResolvedValue(null);
    mount();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(await screen.findByText(compareViewText.empty.noRunTitle)).toBeInTheDocument();
  });

  it("o estado vazio com o atalho passa no axe", async () => {
    runs.latest.mockResolvedValue(latestRun([entry(3, 1), entry(1, 2)]));
    const { container } = mount();
    await screen.findByRole("button", { name: compareViewText.empty.compareStudyTop("Viga leve") });
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
