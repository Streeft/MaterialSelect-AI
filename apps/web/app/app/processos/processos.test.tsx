import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { suggestText } from "@/lib/i18n-suggest";
import type {
  Process,
  ProcessClass,
  ProcessClassDetail,
  ProcessDetail,
  ProcessMatrix,
} from "@/lib/types";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";

const t = ptBR.processes;
const f = ptBR.family;

const route = { pathname: "/app/processos", slug: "fundicao" };
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useParams: () => ({ slug: route.slug }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

/**
 *      conformacao ── conformacao-liquido → "Fundição"
 *      uniao → "Solda"
 *
 * `conformacao` is a **pure branch**: nothing is filed directly in it. It is the
 * case that separates "empty folder" from "folder whose contents are one level
 * down", and the two must not render the same sentence.
 */
const classes: ProcessClass[] = [
  { id: 1, name: "Conformação", slug: "conformacao", parent_id: null, description: null, process_count: 0 },
  {
    id: 2,
    name: "Conformação em estado líquido",
    slug: "conformacao-liquido",
    parent_id: 1,
    description: null,
    process_count: 1,
  },
  { id: 3, name: "União", slug: "uniao", parent_id: null, description: null, process_count: 1 },
];

const fundicao: Process = {
  id: 10,
  name: "Fundição",
  slug: "fundicao",
  class_id: 2,
  class_name: "Conformação em estado líquido",
  class_slug: "conformacao-liquido",
  description: "Verte metal líquido num molde.",
  is_demo: true,
  material_count: 3,
};

const solda: Process = {
  id: 11,
  name: "Solda",
  slug: "solda",
  class_id: 3,
  class_name: "União",
  class_slug: "uniao",
  description: null,
  is_demo: true,
  material_count: 1,
};

const detail: ProcessDetail = {
  ...fundicao,
  attributes: [
    {
      display_unit: null,
      display_value: null,
      display_min: null,
      display_max: null,
      display_typical: null,
      display_uncertainty: null,
      attribute_id: 1,
      attribute_name: "Faixa de massa",
      attribute_slug: "faixa-massa",
      kind: "ENVELOPE",
      value_scalar: null,
      value_min: 0.2,
      value_max: 400,
      value_typical: 200.1,
      labels: [],
      original_unit: "kg",
      normalized_value: 200.1,
      normalized_min: 0.2,
      normalized_max: 400,
      canonical_unit: "kg",
      conversion_method: "identity:kg",
      uncertainty: null,
      measurement_condition: null,
      notes: null,
      source_label: "Dados demonstrativos",
      data_quality: "ESTIMADO",
      is_missing: false,
    },
    {
      display_unit: null,
      display_value: null,
      display_min: null,
      display_max: null,
      display_typical: null,
      display_uncertainty: null,
      attribute_id: 2,
      attribute_name: "Forma",
      attribute_slug: "forma",
      kind: "DISCRETO",
      value_scalar: null,
      value_min: null,
      value_max: null,
      value_typical: null,
      labels: ["Maciço 3D", "Oco 3D"],
      original_unit: null,
      normalized_value: null,
      normalized_min: null,
      normalized_max: null,
      canonical_unit: null,
      conversion_method: null,
      uncertainty: null,
      measurement_condition: null,
      notes: null,
      source_label: null,
      data_quality: "ESTIMADO",
      is_missing: false,
    },
    {
      display_unit: null,
      display_value: null,
      display_min: null,
      display_max: null,
      display_typical: null,
      display_uncertainty: null,
      attribute_id: 3,
      attribute_name: "Lote econômico",
      attribute_slug: "lote-economico",
      kind: "ESCALAR",
      value_scalar: null,
      value_min: null,
      value_max: null,
      value_typical: null,
      labels: [],
      original_unit: null,
      normalized_value: null,
      normalized_min: null,
      normalized_max: null,
      canonical_unit: null,
      conversion_method: null,
      uncertainty: null,
      measurement_condition: null,
      notes: null,
      source_label: null,
      data_quality: "ESTIMADO",
      is_missing: true,
    },
  ],
};
// D-205: a cost is dimensionless (money is in no unit system, D-65) and an
// hourly rate arrives as the Pint's "1/hour".
const scalarAttribute = detail.attributes[0]!;
detail.attributes.push(
  {
    ...scalarAttribute,
    attribute_id: 4,
    attribute_name: "Custo de ferramental dedicado",
    attribute_slug: "custo-ferramental",
    kind: "ESCALAR",
    value_scalar: 50000,
    value_min: null,
    value_max: null,
    value_typical: null,
    original_unit: "dimensionless",
    canonical_unit: "dimensionless",
  },
  {
    ...scalarAttribute,
    attribute_id: 5,
    attribute_name: "Custo de operação por hora",
    attribute_slug: "custo-hora-operacao",
    kind: "ESCALAR",
    value_scalar: 250,
    value_min: null,
    value_max: null,
    value_typical: null,
    original_unit: "1/hour",
    canonical_unit: "1/hour",
  },
);

const familyDetail: ProcessClassDetail = {
  id: 1,
  name: "Conformação",
  slug: "conformacao",
  parent_id: null,
  description: null,
  process_count: 0,
  applications: "Produção em série da forma primária.",
  characteristics: null,
  ancestors: [],
  children: [classes[1] as ProcessClass],
  descendant_process_count: 1,
  processes: [],
};

const matrixCalls: unknown[] = [];
const emptyCap = { minimum: null, maximum: null, unit: null };
const matrixData: ProcessMatrix = {
  columns: [
    { slug: "metais", name: "Metais", material_count: 5 },
    { slug: "polimeros", name: "Polímeros", material_count: 2 },
  ],
  rows: [
    {
      process: fundicao,
      counts: { metais: 3 },
      mass: { minimum: 0.2, maximum: 400, unit: "kg" },
      thickness: emptyCap,
      batch: null,
    },
    {
      process: solda,
      counts: { metais: 1, polimeros: 1 },
      mass: emptyCap,
      thickness: emptyCap,
      batch: 20,
    },
  ],
  without_data: { massa: 1 },
};

const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  getProcessMatrix: (query: unknown) => {
    matrixCalls.push(query);
    const q = query as { massa?: string };
    return Promise.resolve(
      q.massa ? { ...matrixData, rows: [matrixData.rows[0]!] } : matrixData,
    );
  },
  listProcesses: () => Promise.resolve([fundicao, solda]),
  listProcessClasses: () => Promise.resolve(classes),
  getProcess: () => Promise.resolve(detail),
  getProcessClass: () => Promise.resolve(familyDetail),
  // P1-4: a ficha traz a estrela e anota a visita, então toda tela de registro
  // passa por estas quatro. O espaço vazio é o estado honesto aqui — o teste é
  // sobre a ficha, não sobre os marcadores.
  getMyRecords: () => Promise.resolve({ favorites: [], recents: [], own_records: [] }),
  addFavorite: () => Promise.resolve({ favorites: [], recents: [], own_records: [] }),
  removeFavorite: () => Promise.resolve({ favorites: [], recents: [], own_records: [] }),
  touchRecent: () => Promise.resolve(undefined),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: ProcessesPage } = await import("./page");
const { default: ProcessDetailPage } = await import("./[slug]/page");
const { default: ProcessFamilyPage } = await import("./familia/[slug]/page");

describe("a lista de processos", () => {
  it("agrupa por família raiz e chega a um processo filho da subfamília", async () => {
    // The grouping walks `parent_id` rather than assuming two levels: "Fundição"
    // is filed under a *sub*family, and a flat read would lose it.
    route.pathname = "/app/processos";
    render(wrap(<ProcessesPage />));

    expect(await screen.findByShadowRole("link", { name: "Conformação" })).toBeInTheDocument();
    expect(screen.getByShadowRole("link", { name: "Fundição" })).toBeInTheDocument();
    expect(screen.getByShadowRole("link", { name: "Solda" })).toBeInTheDocument();
  });

  it("leva ao detalhe de cada processo pelo slug", async () => {
    route.pathname = "/app/processos";
    render(wrap(<ProcessesPage />));

    expect(await screen.findByShadowRole("link", { name: "Fundição" })).toHaveAttribute(
      "href",
      "/app/processos/fundicao",
    );
  });

  // D-209: a base of processes, filtered by chips and by name.
  it("filtra pela família em chip e pelo nome, e diz quando nada sobra", async () => {
    const user = userEvent.setup();
    route.pathname = "/app/processos";
    render(wrap(<ProcessesPage />));
    await screen.findByShadowRole("link", { name: "Fundição" });

    await user.click(
      screen.getByShadowRole("button", { name: ptBR.ds.filterChip(t.filterFamily, ptBR.ds.anyValue) }),
    );
    await user.click(await screen.findByShadowRole("button", { name: "União" }));
    expect(screen.queryByShadowRole("link", { name: "Fundição" })).not.toBeInTheDocument();
    expect(screen.getByShadowRole("link", { name: "Solda" })).toBeInTheDocument();

    await user.type(screen.getByShadowRole("searchbox", { name: t.searchLabel }), "fundi");
    expect(await screen.findByText(t.emptyFiltered)).toBeInTheDocument();
  });
});

describe("matriz, capacidade e comparação (D-219)", () => {
  const go = (search: string) => window.history.replaceState(null, "", `/app/processos${search}`);

  it("abre a matriz pelo endereço, escreve a célula vazia e a ausência de dado", async () => {
    route.pathname = "/app/processos";
    go("?modo=matriz");
    render(wrap(<ProcessesPage />));

    expect(await screen.findByShadowRole("link", { name: "Fundição" })).toBeInTheDocument();
    expect(screen.getByShadowRole("columnheader", { name: "Polímeros" })).toBeInTheDocument();
    // Fundição não tem material de polímero: a célula diz "nenhum", e não 0.
    expect(screen.getAllByShadowText(t.matrixNone).length).toBeGreaterThan(0);
    // Solda não tem faixa de massa cadastrada: a ausência é escrita.
    expect(screen.getAllByShadowText(ptBR.quality.AUSENTE).length).toBeGreaterThan(0);
    go("");
  });

  it("manda o filtro de massa ao backend e só mostra o que ele devolveu", async () => {
    route.pathname = "/app/processos";
    go("?modo=matriz&massa=5&massa_un=g");
    render(wrap(<ProcessesPage />));

    await screen.findByShadowRole("link", { name: "Fundição" });
    await waitFor(() => expect(screen.queryByShadowRole("link", { name: "Solda" })).toBeNull());
    expect(matrixCalls.at(-1)).toMatchObject({ massa: "5", massaUnidade: "g" });
    // Quem ficou sem dado é contado, não escondido.
    expect(screen.getByShadowText(t.withoutData(t.capMass.toLocaleLowerCase("pt-BR"), 1))).toBeInTheDocument();
    go("");
  });

  it("compara dois processos lado a lado e guarda a escolha no endereço", async () => {
    const user = userEvent.setup();
    route.pathname = "/app/processos";
    go("?modo=matriz");
    render(wrap(<ProcessesPage />));

    await user.click(await screen.findByShadowLabelText(t.compareRow("Fundição")));
    await user.click(screen.getByShadowLabelText(t.compareRow("Solda")));

    expect(window.location.search).toContain("comparar=fundicao%2Csolda");
    expect(await screen.findByShadowText(t.compareTitle)).toBeInTheDocument();
    // O mock devolve a mesma ficha para os dois: a faixa de massa aparece com a unidade.
    expect((await screen.findAllByShadowText(/0,2 – 400/)).length).toBeGreaterThan(0);
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
    go("");
  });

  it("filtra pela família vinda do endereço", async () => {
    route.pathname = "/app/processos";
    go("?familia=uniao");
    render(wrap(<ProcessesPage />));

    expect(await screen.findByShadowRole("link", { name: "Solda" })).toBeInTheDocument();
    expect(screen.queryByShadowRole("link", { name: "Fundição" })).not.toBeInTheDocument();
    go("");
  });
});

describe("a ficha do processo", () => {
  it("mostra cada atributo com o tipo de valor que diz por qual regra ele é comparado", async () => {
    route.pathname = "/app/processos/fundicao";
    render(wrap(<ProcessDetailPage />));

    expect(await screen.findByText("Faixa de massa")).toBeInTheDocument();
    // O tipo não é enfeite: envelope é comparado por alcance (D-59), e quem não
    // vê a regra não consegue conferir a seleção que a usou.
    expect(screen.getByText(t.kindENVELOPE)).toBeInTheDocument();
    expect(screen.getByText(t.kindEnvelopeHint)).toBeInTheDocument();
    expect(screen.getByText(t.kindDISCRETO)).toBeInTheDocument();
  });

  it("desenha o envelope como faixa e o discreto como rótulos", async () => {
    route.pathname = "/app/processos/fundicao";
    render(wrap(<ProcessDetailPage />));

    expect(await screen.findByText(/0,2\s*–\s*400/)).toBeInTheDocument();
    expect(screen.getByText("Maciço 3D")).toBeInTheDocument();
    expect(screen.getByText("Oco 3D")).toBeInTheDocument();
  });

  it("escreve custo sem traço e a unidade de tempo em símbolo (D-205)", async () => {
    route.pathname = "/app/processos/fundicao";
    render(wrap(<ProcessDetailPage />));

    const cost = await screen.findByText("50.000");
    // The dash after a number reads as "missing" in this app; a cost has no unit to write.
    expect(cost.parentElement).not.toHaveTextContent("—");
    expect(screen.getByText("250").parentElement).toHaveTextContent(/250\s*1\/h$/);
    expect(screen.queryByText(/hour/)).not.toBeInTheDocument();
  });

  it("escreve a ausência em vez de desenhar zero", async () => {
    route.pathname = "/app/processos/fundicao";
    render(wrap(<ProcessDetailPage />));

    // "Lote econômico" veio `is_missing`: é o quarto estado do dado (D-24), e
    // tem rótulo escrito — nunca 0, nunca traço, nunca célula vazia.
    await screen.findByText("Lote econômico");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getAllByText(ptBR.quality.AUSENTE).length).toBeGreaterThan(0);
  });

  it("dá ao leitor a trilha de volta, sem link para a própria página", async () => {
    route.pathname = "/app/processos/fundicao";
    render(wrap(<ProcessDetailPage />));

    const trail = await screen.findByShadowRole("navigation", { name: "Trilha de navegação" });
    expect(within(trail).getByShadowRole("link", { name: t.backToProcesses })).toBeInTheDocument();
    // O último passo é a página atual: texto com aria-current, nunca link.
    expect(within(trail).queryByShadowRole("link", { name: "Fundição" })).not.toBeInTheDocument();
    expect(within(trail).getByText("Fundição")).toHaveAttribute("aria-current", "page");
  });
});

describe("a ficha da família de processo", () => {
  it("mostra a prosa escrita e nomeia a que ninguém escreveu", async () => {
    route.pathname = "/app/processos/familia/conformacao";
    route.slug = "conformacao";
    render(wrap(<ProcessFamilyPage />));

    expect(await screen.findByText("Produção em série da forma primária.")).toBeInTheDocument();
    // `characteristics` é null: ausência com rótulo escrito, nunca painel vazio.
    expect(screen.getByText(f.unwritten)).toBeInTheDocument();
  });

  it("distingue pasta vazia de pasta cujo conteúdo está um nível abaixo", async () => {
    route.pathname = "/app/processos/familia/conformacao";
    route.slug = "conformacao";
    render(wrap(<ProcessFamilyPage />));

    // Nada diretamente aqui, mas há subfamília: as duas frases são diferentes
    // porque os dois estados são diferentes.
    expect(await screen.findByText(t.emptyFolderWithChildren)).toBeInTheDocument();
    expect(screen.queryByText(t.emptyFolder)).not.toBeInTheDocument();
  });

  it("diz quantos há no total quando o galho é puro", async () => {
    route.pathname = "/app/processos/familia/conformacao";
    route.slug = "conformacao";
    render(wrap(<ProcessFamilyPage />));

    // Sem o total da subárvore o leitor vê zero e não tem por que abrir o galho.
    expect(await screen.findByText(new RegExp(t.countBelow(1)))).toBeInTheDocument();
  });
});

describe("processos — Sugestão da IA (D-229)", () => {
  const answer = {
    tool: "processos",
    summary: "Para explorar.",
    suggestions: [
      {
        title: "Família Conformação",
        body: "Liste os processos da família.",
        actions: [
          { type: "search", label: "Buscar Conformação", q: "Conformação" },
          { type: "open_route", label: "Ver Solda", path: "/app/processos/solda" },
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

  it("na lista, “Buscar” põe o texto na busca do endereço; só consulta ao clicar", async () => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
    route.pathname = "/app/processos";
    window.history.replaceState(null, "", "/app/processos");
    const user = userEvent.setup();
    render(wrap(<ProcessesPage />));
    await screen.findByShadowRole("link", { name: "Fundição" });
    expect(suggest.fn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await user.click(await screen.findByRole("button", { name: "Buscar Conformação" }));
    expect(suggest.fn).toHaveBeenCalledWith("processos", { slug: null });
    await waitFor(() => expect(decodeURIComponent(window.location.search)).toContain("busca=Conformação"));
    window.history.replaceState(null, "", "/app/processos");
  });

  it("na ficha, envia o slug e a busca vira um link para a lista, a rota para o processo", async () => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
    route.pathname = "/app/processos/fundicao";
    route.slug = "fundicao";
    const user = userEvent.setup();
    render(wrap(<ProcessDetailPage />));
    await screen.findByText("Faixa de massa");
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    expect(await screen.findByRole("link", { name: "Buscar Conformação" })).toHaveAttribute(
      "href",
      "/app/processos?busca=Conforma%C3%A7%C3%A3o",
    );
    expect(screen.getByRole("link", { name: "Ver Solda" })).toHaveAttribute("href", "/app/processos/solda");
    expect(suggest.fn).toHaveBeenCalledWith("processos", { slug: "fundicao" });
  });
});
