import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC roles live inside a
// shadow root, invisible to plain @testing-library/react queries.
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { suggestText } from "@/lib/i18n-suggest";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { CostRequest, CostResult, MaterialListItem, SuggestionsOut } from "@/lib/types";

const t = ptBR.cost;

const estimatePartCost = vi.fn<(payload: CostRequest) => Promise<CostResult>>();

const materials: MaterialListItem[] = [
  {
    id: 7,
    name: "Liga Alumínio Demo A",
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 3, importado: 0, estimado: 1, missing: 0 },
    designations: [],
  },
  {
    id: 8,
    name: "Aço Demo B",
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 3, importado: 0, estimado: 1, missing: 0 },
    designations: [],
  },
  {
    id: 9,
    name: "Polímero Demo C",
    class_name: "Polímeros",
    class_slug: "polimeros",
    subclass: null,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 3, importado: 0, estimado: 1, missing: 0 },
    designations: [],
  },
];

const result: CostResult = {
  material_id: 7,
  material_name: "Liga Alumínio Demo A",
  part_mass: 2,
  batch_size: 1000,
  write_off_years: 5,
  load_factor: 0.5,
  material_cost_per_mass: 8,
  monetary_unit_note:
    "Os valores estão em unidade monetária não especificada: o catálogo registra custo por massa sem declarar moeda.",
  costed: [
    {
      process_id: 1,
      process_slug: "fundicao-areia",
      process_name: "Fundição em areia",
      class_name: "Conformação",
      rank: 1,
      terms: {
        material: 20,
        tooling: 12,
        overhead: 7.08,
        capital: 0.95,
        total: 40.03,
        batch_sensitive: 12,
      },
      curve: [
        { batch_size: 1, cost: 12028.03 },
        { batch_size: 10, cost: 1228.03 },
        { batch_size: 100, cost: 148.03 },
        { batch_size: 1000, cost: 40.03 },
        { batch_size: 10000, cost: 29.23 },
        { batch_size: 100000, cost: 28.15 },
        { batch_size: 1000000, cost: 28.04 },
      ],
    },
  ],
  uncosted: [
    {
      process_id: 2,
      process_slug: "retificacao",
      process_name: "Retificação",
      missing_slugs: ["custo-ferramental"],
      missing_labels: ["Custo de ferramental dedicado"],
      reason: "Sem dado econômico: Custo de ferramental dedicado",
    },
  ],
};

// The brief lives in the URL (D-212): a test opens the page at an address.
function setQuery(query: string) {
  window.history.replaceState(null, "", `/app/custo${query ? `?${query}` : ""}`);
}

// `PageHeader` reads the pathname for the route palette (D-49); without this it
// gets null and the header throws before anything renders.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/custo",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const getDefaults = vi.fn(async () => (await import("@/lib/defaults.fixture")).defaultsFixture);
const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  getDefaults: () => getDefaults(),
  listMaterials: () => Promise.resolve(materials),
  estimatePartCost: (payload: CostRequest) => estimatePartCost(payload),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: CustoPage } = await import("./page");

async function open() {
  render(wrap(<CustoPage />));
  await screen.findByRole("heading", { name: t.briefStep });
}

beforeEach(() => {
  setQuery("");
  getDefaults.mockClear();
  estimatePartCost.mockReset();
  estimatePartCost.mockResolvedValue(result);
});

describe("Custo da peça", () => {
  it("não estima enquanto faltar a massa, e diz por quê no lugar do resultado", async () => {
    // Nem a massa nem o lote têm valor inventado: são os números que decidem.
    await open();

    // D-86/D-220: no button to press; the result card says what is missing.
    expect(await screen.findByText(t.blocked.mass)).toBeInTheDocument();
    expect(screen.queryByShadowRole("button", { name: t.estimate })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(estimatePartCost).not.toHaveBeenCalled();
    // The way to get the mass is one link away (D-220).
    expect(screen.getByRole("link", { name: t.massToSolver })).toHaveAttribute("href", "/app/dimensionar");
  });

  it("diz quando a massa veio do Dimensionar (D-220)", async () => {
    setQuery("material=7&massa=0.402&origem=dimensionar");
    await open();
    expect(screen.getByText(t.massFromSolver)).toBeInTheDocument();
    expect(screen.getByShadowRole("spinbutton", { name: "Massa da peça (kg)" })).toHaveValue(0.402);
  });

  it("recolhe as premissas, mas imprime cada valor no resumo", async () => {
    setQuery("material=7&massa=2");
    await open();

    const summary = screen.getByText(t.assumptionsSummary("5", "0,5"));
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(false);
  });

  it("aceita a peça e o lote pela URL, que é como o dimensionamento liga aqui", async () => {
    setQuery("material=7&massa=2&lote=500");
    const user = userEvent.setup();
    await open();

    await waitFor(() => expect(estimatePartCost).toHaveBeenCalledTimes(1));
    expect(estimatePartCost.mock.calls[0]![0]).toMatchObject({
      material_id: 7,
      part_mass: 2,
      batch_size: 500,
    });
  });

  it("mostra os quatro termos, não só o total", async () => {
    // A decomposição é o item; total sozinho seria oráculo.
    setQuery("material=7&massa=2");
    const user = userEvent.setup();
    await open();

    // The result card is always on screen; the table is what the run adds.
    const table = await screen.findByRole("table");
    for (const value of ["20", "12", "7,08", "0,95", "40,03"]) {
      expect(within(table).getByText(value)).toBeInTheDocument();
    }
  });

  it("diz em que unidade o número está, em vez de imprimir moeda", async () => {
    // Dinheiro não está em sistema de unidades nenhum, e a tela admite isso.
    setQuery("material=7&massa=2");
    const user = userEvent.setup();
    await open();

    // The result card is always on screen; the table is what the run adds.
    await screen.findByRole("table");
    expect(screen.getByText(new RegExp("unidade monetária não especificada"))).toBeInTheDocument();
  });

  it("nomeia o processo sem dado econômico, com o motivo", async () => {
    // D-24, e a razão concreta: ferramental em branco viraria o mais barato.
    setQuery("material=7&massa=2");
    const user = userEvent.setup();
    await open();

    await screen.findByText(t.uncostedTitle);
    expect(screen.getByText(/Retificação/)).toBeInTheDocument();
    expect(screen.getByText(/Custo de ferramental dedicado/)).toBeInTheDocument();
  });

  it("envia as premissas da oficina junto, com os padrões visíveis", async () => {
    setQuery("material=7&massa=2");
    const user = userEvent.setup();
    await open();

    await waitFor(() => expect(estimatePartCost).toHaveBeenCalledTimes(1));
    expect(estimatePartCost.mock.calls[0]![0]).toMatchObject({
      write_off_years: 5,
      load_factor: 0.5,
    });
  });

  it("leva amortização e fator de carga pela URL, nos dois sentidos (D-212)", async () => {
    setQuery("material=7&massa=2&amortizacao=8&fator_carga=0.7");
    const user = userEvent.setup();
    await open();

    // Read from the link…
    expect(screen.getByText(t.assumptionsSummary("8", "0,7"))).toBeInTheDocument();
    await waitFor(() => expect(estimatePartCost).toHaveBeenCalledTimes(1));
    expect(estimatePartCost.mock.calls[0]![0]).toMatchObject({
      write_off_years: 8,
      load_factor: 0.7,
    });

    // …and written back as the reader types.
    const mass = await screen.findByShadowLabelText(/Massa da peça/);
    await user.clear(mass);
    await user.type(mass, "3");
    const params = new URLSearchParams(window.location.search);
    expect(params.get("massa")).toBe("3");
    expect(params.get("amortizacao")).toBe("8");
    expect(params.get("fator_carga")).toBe("0.7");
  });

  it("recusa fator de carga acima de um antes de chamar a API", async () => {
    // O servidor também recusa (o schema tem o limite), mas deixar o botão
    // ativo mandaria o leitor descobrir isso por um 422.
    setQuery("material=7&massa=2");
    await open();

    const loadFactor = await screen.findByShadowLabelText(/Fator de carga/);
    await userEvent.clear(loadFactor);
    await userEvent.type(loadFactor, "1.5");

    await new Promise((resolve) => setTimeout(resolve, 600));
    // Never asked with the refused value: the server would only answer a 422.
    expect(estimatePartCost.mock.calls.some(([req]) => (req.load_factor ?? 0) > 1)).toBe(false);
    // The premise that blocks is never left folded away.
    expect(screen.getByText(t.blocked.loadFactor)).toBeInTheDocument();
    expect(
      (screen.getByText(t.assumptionsSummary("5", "1,5")).closest("details") as HTMLDetailsElement)
        .open,
    ).toBe(true);
  });

  it("desenha a curva de custo por lote com a alternância para a tabela", async () => {
    setQuery("material=7&massa=2");
    const user = userEvent.setup();
    await open();

    expect(await screen.findByRole("figure", { name: /Curva Custo/i })).toBeInTheDocument();
    expect(screen.getByShadowRole("button", { name: "Tabela" })).toBeInTheDocument();
  });

  it("abre com os padrões do servidor, sem número copiado na tela (D-216)", async () => {
    const { defaultsFixture } = await import("@/lib/defaults.fixture");
    getDefaults.mockResolvedValueOnce({
      ...defaultsFixture,
      custo: { ...defaultsFixture.custo, batch_size: 250, write_off_years: 7, load_factor: 0.8 },
    });
    setQuery("material=7&massa=2");
    const user = userEvent.setup();
    await open();

    expect(screen.getByText(t.assumptionsSummary("7", "0,8"))).toBeInTheDocument();
    await waitFor(() => expect(estimatePartCost).toHaveBeenCalledTimes(1));
    expect(estimatePartCost.mock.calls[0]![0]).toMatchObject({
      batch_size: 250,
      write_off_years: 7,
      load_factor: 0.8,
    });
    // A default equal to the server's leaves the address clean.
    expect(new URLSearchParams(window.location.search).has("lote")).toBe(false);
  });

  it("espera os padrões: carregando mostra esqueleto, falha mostra erro com nova tentativa", async () => {
    getDefaults.mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup();
    render(wrap(<CustoPage />));

    const alert = await screen.findByRole("alert");
    expect(screen.queryByRole("heading", { name: t.briefStep })).not.toBeInTheDocument();
    await user.click(within(alert).getByShadowRole("button", { name: ptBR.ui.retry }));

    expect(await screen.findByRole("heading", { name: t.briefStep })).toBeInTheDocument();
    expect(getDefaults).toHaveBeenCalledTimes(2);
  });

  it("compara até cinco materiais com a mesma peça, lote e premissas (D-216)", async () => {
    setQuery("material=7&massa=2&comparar=8,9");
    estimatePartCost.mockImplementation(async (payload) => ({
      ...result,
      material_id: payload.material_id,
      material_name: materials.find((m) => m.id === payload.material_id)!.name,
      // Material 9 has no process with a computable cost.
      costed:
        payload.material_id === 9
          ? []
          : result.costed.map((c) => ({
              ...c,
              terms: { ...c.terms, total: payload.material_id === 8 ? 55.5 : c.terms.total },
            })),
    }));
    const user = userEvent.setup();
    await open();

    await waitFor(() => expect(estimatePartCost).toHaveBeenCalledTimes(3));
    const sent = estimatePartCost.mock.calls.map((call) => call[0]);
    expect(sent.map((p) => p.material_id)).toEqual([7, 8, 9]);
    // The same brief for all three: only the material changes.
    for (const payload of sent) {
      expect(payload).toMatchObject({
        part_mass: 2,
        batch_size: 1000,
        write_off_years: 5,
        load_factor: 0.5,
      });
    }
    const table = await screen.findByRole("table", { name: t.compareCaption });
    expect(within(table).getByText("Aço Demo B")).toBeInTheDocument();
    expect(within(table).getByText("55,5")).toBeInTheDocument();
    // A material with no costable process is said in words, never a zero.
    expect(within(table).getByText(t.compareNoProcess)).toBeInTheDocument();
  });

  it("guarda os materiais comparados na URL e trava em cinco", async () => {
    setQuery("material=7&massa=2&comparar=8");
    const user = userEvent.setup();
    await open();

    expect(screen.getByRole("list", { name: t.compareLabel })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.compareRemove("Aço Demo B") }));
    expect(new URLSearchParams(window.location.search).has("comparar")).toBe(false);

    // More than four extras in a link are cut, not trusted.
    cleanup();
    setQuery("material=7&massa=2&comparar=1,2,3,4,5,6");
    await open();
    expect(screen.getAllByRole("button", { name: /^Remover .* da comparação$/ })).toHaveLength(4);
  });

  it("uma falha em um dos outros materiais aparece na linha dele e não derruba o resto", async () => {
    setQuery("material=7&massa=2&comparar=8");
    estimatePartCost.mockImplementation(async (payload) => {
      if (payload.material_id === 8) throw new Error("falhou");
      return result;
    });
    const user = userEvent.setup();
    await open();

    const table = await screen.findByRole("table", { name: t.compareCaption });
    expect(within(table).getByText(new RegExp(t.compareFailed))).toBeInTheDocument();
    // The first material's answer is still on screen.
    expect(screen.getAllByRole("table")[0]).toBeInTheDocument();
  });
});

describe("custo — Sugestão da IA (D-230b)", () => {
  const answer: SuggestionsOut = {
    tool: "custo",
    summary: "Duas ideias para o lote.",
    suggestions: [
      {
        title: "Aumente o lote",
        body: "Um lote maior dilui o ferramental por peça.",
        actions: [
          { type: "set_param", label: "tamanho do lote: 2000", name: "batch_size", value: 2000 },
          { type: "set_param", label: "tamanho do lote: texto", name: "batch_size", value: "mil" },
          { type: "set_param", label: "parâmetro que a tela não tem", name: "voltagem", value: 3 },
        ],
      },
      {
        title: "Amortize em mais anos",
        body: "Um prazo maior reduz o capital por peça.",
        actions: [
          { type: "set_param", label: "anos de amortização: 8", name: "write_off_years", value: 8 },
          { type: "open_route", label: "Ver o processo", path: "/app/processos/fundicao-areia" },
        ],
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

  beforeEach(() => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
  });

  it("só consulta ao clicar, com o pedido da estimativa que a tela mostra", async () => {
    setQuery("material=7&massa=2&lote=500");
    const user = userEvent.setup();
    await open();
    await waitFor(() => expect(estimatePartCost).toHaveBeenCalled());
    expect(suggest.fn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Aumente o lote");
    expect(suggest.fn).toHaveBeenCalledTimes(1);
    expect(suggest.fn).toHaveBeenCalledWith("custo", {
      request: { material_id: 7, part_mass: 2, batch_size: 500, write_off_years: 5, load_factor: 0.5 },
    });
    // Nothing was applied by the answer arriving; a route is a link.
    expect(new URLSearchParams(window.location.search).get("lote")).toBe("500");
    expect(screen.getByRole("link", { name: "Ver o processo" })).toHaveAttribute(
      "href",
      "/app/processos/fundicao-areia",
    );
  });

  it("aplicar um parâmetro muda o endereço e o campo, e a estimativa acompanha", async () => {
    setQuery("material=7&massa=2&lote=500");
    const user = userEvent.setup();
    await open();
    await waitFor(() => expect(estimatePartCost).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    // A value that is not a number, and a parameter the screen does not have, are not buttons.
    await screen.findByText("Aumente o lote");
    expect(screen.queryByRole("button", { name: "tamanho do lote: texto" })).toBeNull();
    expect(screen.queryByRole("button", { name: "parâmetro que a tela não tem" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "tamanho do lote: 2000" }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("lote")).toBe("2000"));
    const batch = screen.getByShadowRole("spinbutton", { name: /Peças no lote/ });
    expect(batch).toHaveValue(2000);
    // The field that changed is marked for a moment.
    await waitFor(() => expect(batch).toHaveAttribute("data-ai-changed", "true"));
    await waitFor(() => expect(estimatePartCost).toHaveBeenCalledTimes(2));
    expect(estimatePartCost.mock.calls[1]![0]).toMatchObject({ batch_size: 2000 });
  });

  it("uma premissa sugerida abre as premissas recolhidas e mostra o campo", async () => {
    setQuery("material=7&massa=2");
    const user = userEvent.setup();
    await open();
    const summary = screen.getByText(t.assumptionsSummary("5", "0,5"));
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await user.click(await screen.findByRole("button", { name: "anos de amortização: 8" }));
    await waitFor(() => expect(details.open).toBe(true));
    expect(new URLSearchParams(window.location.search).get("amortizacao")).toBe("8");
    expect(screen.getByShadowRole("spinbutton", { name: /Amortização/i })).toHaveValue(8);
  });

  it("sem a massa não há o que perguntar: o botão fica desligado e diz por quê", async () => {
    await open();
    expect(screen.getByRole("button", { name: suggestText.button })).toBeDisabled();
    expect(suggest.fn).not.toHaveBeenCalled();
    expect(screen.getByText(suggestText.needsBrief)).toBeInTheDocument();
  });

  it("não tem violação de acessibilidade com o painel aberto", async () => {
    setQuery("material=7&massa=2");
    const user = userEvent.setup();
    const { container } = render(wrap(<CustoPage />));
    await screen.findByRole("heading", { name: t.briefStep });
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Aumente o lote");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});
