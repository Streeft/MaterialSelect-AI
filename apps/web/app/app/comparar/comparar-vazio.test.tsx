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

// D-232: the studies the shortcut reads, and what running one answers.
const studies = vi.hoisted(() => ({
  list: [] as Record<string, unknown>[],
  run: vi.fn(),
}));
const study = (id: number, name: string, createdAt: string, universe = "material") => ({
  id,
  name,
  description: null,
  created_at: createdAt,
  constraint_count: 1,
  criterion_count: 0,
  stage_count: 1,
  universe,
});
const candidate = (record_id: number, rank: number | null) => ({
  record_id,
  name: `Material ${record_id}`,
  class_name: "Metais",
  index_value: null,
  score: null,
  rank,
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
  listStudies: () => Promise.resolve(studies.list),
  runStudy: (id: number) => studies.run(id),
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

describe("comparador: top do último estudo (D-232)", () => {
  beforeEach(() => {
    requests.length = 0;
    nav.query = "";
    window.history.replaceState(null, "", "/app/comparar");
    studies.list = [];
    studies.run.mockReset();
  });

  it("não oferece o atalho quando o leitor não tem estudo de materiais", async () => {
    studies.list = [study(9, "De processos", "2026-11-12T10:00:00Z", "process")];
    mount();
    await screen.findByRole("heading", { name: compareViewText.empty.title });
    await waitFor(() => expect(screen.queryByText(compareViewText.empty.loading)).toBeNull());
    expect(screen.queryByRole("button", { name: /top do estudo/i })).toBeNull();
    expect(studies.run).not.toHaveBeenCalled();
  });

  it("executa o estudo salvo mais recente e leva os primeiros ao comparador, na ordem do ranking", async () => {
    studies.list = [
      study(5, "Mais antigo", "2026-10-01T10:00:00Z"),
      study(7, "Viga leve", "2026-11-10T10:00:00Z"),
      study(9, "De processos", "2026-11-12T10:00:00Z", "process"),
    ];
    studies.run.mockResolvedValue({
      universe: "material",
      candidates: [candidate(4, 3), candidate(3, 1), candidate(1, 2), candidate(2, null)],
    });
    mount();

    const button = await screen.findByRole("button", {
      name: compareViewText.empty.compareStudyTop("Viga leve"),
    });
    fireEvent.click(button);

    await waitFor(() => expect(studies.run).toHaveBeenCalledWith(7));
    // Ranked first (by rank, never by the order the rows came), the unranked after.
    await waitFor(() => expect(requests.at(-1)?.material_ids).toEqual([3, 1, 4, 2]));
    expect(screen.queryByRole("heading", { name: compareViewText.empty.title })).toBeNull();
  });

  it("leva no máximo os cinco primeiros", async () => {
    studies.list = [study(7, "Viga leve", "2026-11-10T10:00:00Z")];
    studies.run.mockResolvedValue({
      universe: "material",
      candidates: [1, 2, 3, 4, 5, 6, 7].map((id) => candidate(id, id)),
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: compareViewText.empty.compareStudyTop("Viga leve") }),
    );
    await waitFor(() => expect(requests.at(-1)?.material_ids).toEqual([1, 2, 3, 4, 5]));
  });

  it("um estudo sem candidatos suficientes diz isso, em vez de comparar um só", async () => {
    studies.list = [study(7, "Viga leve", "2026-11-10T10:00:00Z")];
    studies.run.mockResolvedValue({ universe: "material", candidates: [candidate(1, 1)] });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: compareViewText.empty.compareStudyTop("Viga leve") }),
    );
    expect(await screen.findByText(compareViewText.empty.studyTooFew("Viga leve"))).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: compareViewText.empty.title })).toBeInTheDocument();
  });

  it("um erro ao executar o estudo aparece no cartão, e o atalho pode ser tentado de novo", async () => {
    studies.list = [study(7, "Viga leve", "2026-11-10T10:00:00Z")];
    studies.run.mockRejectedValue(new Error("falhou"));
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: compareViewText.empty.compareStudyTop("Viga leve") }),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: compareViewText.empty.compareStudyTop("Viga leve") })).toBeEnabled();
  });

  it("o estado vazio com o atalho passa no axe", async () => {
    studies.list = [study(7, "Viga leve", "2026-11-10T10:00:00Z")];
    const { container } = mount();
    await screen.findByRole("button", { name: compareViewText.empty.compareStudyTop("Viga leve") });
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
