import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type { Process, ProcessClass, ProcessClassDetail, ProcessDetail } from "@/lib/types";

const t = ptBR.processes;
const f = ptBR.family;

const route = { pathname: "/app/processos", slug: "fundicao" };
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useParams: () => ({ slug: route.slug }),
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

vi.mock("@/lib/api", () => ({
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
