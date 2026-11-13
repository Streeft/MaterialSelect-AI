import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
// The star is an `md-icon-button`, so it lives in a shadow root — the whole
// file uses the shadow-aware queries rather than mixing two `screen`s.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MaterialListItem, MyRecords, Process, SuggestionsOut } from "@/lib/types";
import { suggestText } from "@/lib/i18n-suggest";
import { ptBR } from "@/lib/i18n";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";

const t = ptBR.myRecords;

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/meus-registros",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const quality = { medido: 1, importado: 0, estimado: 0, missing: 0 };

const ownMaterial: MaterialListItem = {
  id: 7,
  name: "Liga da Ana",
  class_name: "Metais",
  class_slug: "metais",
  subclass: null,
  is_demo: false,
  is_own_record: true,
  keywords: [],
  quality,
  designations: [],
};

const process: Process = {
  id: 3,
  name: "Fundição",
  slug: "fundicao",
  class_id: 1,
  class_name: "Conformação",
  class_slug: "conformacao",
  description: null,
  is_demo: true,
  material_count: 2,
};

const populated: MyRecords = {
  favorites: [
    { universe: "material", at: "2026-09-14T10:00:00Z", material: ownMaterial, process: null },
    { universe: "process", at: "2026-09-14T12:00:00Z", material: null, process },
  ],
  recents: [
    { universe: "process", at: "2026-09-14T12:00:00Z", material: null, process },
  ],
  own_records: [ownMaterial],
};

const empty: MyRecords = { favorites: [], recents: [], own_records: [] };

const state = { data: populated };
const removeFavorite = vi.fn(() => Promise.resolve(empty));

const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  getMyRecords: () => Promise.resolve(state.data),
  addFavorite: () => Promise.resolve(state.data),
  removeFavorite: () => removeFavorite(),
  touchRecent: () => Promise.resolve(undefined),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>
  );
}

const { default: MyRecordsPage } = await import("./page");
const { FavoriteButton } = await import("@/components/my-records/FavoriteButton");

describe("meus registros", () => {
  it("mostra favoritos dos dois universos numa lista só", async () => {
    state.data = populated;
    render(wrap(<MyRecordsPage />));

    // Duas vezes de propósito: uma como favorito, outra na lista de registros
    // próprios — as três seções descrevem o mesmo acervo por perguntas
    // diferentes, e não são partições dele.
    await screen.findAllByShadowRole("link", { name: "Liga da Ana" });
    expect(screen.getAllByShadowRole("link", { name: "Fundição" }).length).toBeGreaterThan(0);
  });

  it("rotula cada favorito com o universo a que pertence", async () => {
    state.data = populated;
    render(wrap(<MyRecordsPage />));

    await screen.findAllByShadowRole("link", { name: "Liga da Ana" });
    expect(screen.getAllByShadowText(t.universeMaterial).length).toBeGreaterThan(0);
    expect(screen.getAllByShadowText(t.universeProcess).length).toBeGreaterThan(0);
  });

  it("marca um registro próprio como tal", async () => {
    state.data = populated;
    render(wrap(<MyRecordsPage />));

    await screen.findAllByShadowRole("link", { name: "Liga da Ana" });
    expect(screen.getAllByShadowText(t.ownBadge).length).toBeGreaterThan(0);
  });

  it("declara que registro próprio não passou pela revisão do catálogo", async () => {
    // A mesma afirmação que o documento exportado faz. A tela que os apresenta
    // como coleção é o outro lugar onde ela não pode faltar.
    state.data = populated;
    render(wrap(<MyRecordsPage />));

    expect(await screen.findByShadowText(t.ownNotice)).toBeInTheDocument();
  });

  it("escreve a ausência das três listas em vez de deixar painel em branco", async () => {
    // D-24: painel vazio lê como "isto falhou ao carregar", que é outra coisa.
    state.data = empty;
    render(wrap(<MyRecordsPage />));

    expect(await screen.findByShadowText(t.favoritesEmpty)).toBeInTheDocument();
    expect(screen.getByShadowText(t.recentsEmpty)).toBeInTheDocument();
    expect(screen.getByShadowText(t.ownRecordsEmpty)).toBeInTheDocument();
  });
});

describe("filtros e ações em lote (D-219)", () => {
  const otherMaterial: MaterialListItem = {
    ...ownMaterial,
    id: 8,
    name: "PET da Ana",
    class_name: "Polímeros",
    class_slug: "polimeros",
  };
  const many: MyRecords = {
    favorites: [
      { universe: "material", at: "2026-09-14T10:00:00Z", material: ownMaterial, process: null },
      { universe: "material", at: "2026-09-14T11:00:00Z", material: otherMaterial, process: null },
      { universe: "process", at: "2026-09-14T12:00:00Z", material: null, process },
    ],
    recents: [],
    own_records: [ownMaterial, otherMaterial],
  };

  it("a busca vem do endereço, ignora acento e filtra as três listas", async () => {
    state.data = many;
    window.history.replaceState(null, "", "/app/meus-registros?q=fundicao");
    render(wrap(<MyRecordsPage />));

    await screen.findAllByShadowRole("link", { name: "Fundição" });
    expect(screen.queryAllByShadowRole("link", { name: "Liga da Ana" })).toHaveLength(0);
    expect(screen.getByShadowRole("searchbox")).toHaveValue("fundicao");
    window.history.replaceState(null, "", "/app/meus-registros");
  });

  it("filtra por tipo pelo endereço e escreve a ausência", async () => {
    state.data = many;
    window.history.replaceState(null, "", "/app/meus-registros?tipo=processo");
    render(wrap(<MyRecordsPage />));

    await screen.findAllByShadowRole("link", { name: "Fundição" });
    expect(screen.queryAllByShadowRole("link", { name: "PET da Ana" })).toHaveLength(0);
    // Registros próprios são materiais: a seção diz que nada bate.
    expect(screen.getAllByShadowText(t.noMatch).length).toBeGreaterThan(0);
    window.history.replaceState(null, "", "/app/meus-registros");
  });

  it("compara os materiais marcados e desfavorita com confirmação e desfazer", async () => {
    state.data = many;
    const user = userEvent.setup();
    render(wrap(<MyRecordsPage />));

    await user.click(await screen.findByShadowLabelText(t.selectRow("Liga da Ana")));
    expect(screen.getByShadowRole("button", { name: t.compareSelected })).toBeDisabled();
    await user.click(screen.getByShadowLabelText(t.selectRow("PET da Ana")));

    const compare = screen.getByShadowRole("link", { name: t.compareSelected });
    expect(compare).toHaveAttribute("href", "/app/comparar?materiais=7,8");

    await user.click(screen.getByShadowRole("button", { name: t.unfavoriteSelected }));
    // Confirmação antes de qualquer coisa sair da lista.
    expect(await screen.findByShadowText(t.confirmTitle(2))).toBeInTheDocument();
    await user.click(screen.getAllByShadowRole("button", { name: t.unfavoriteSelected }).at(-1)!);

    expect(await screen.findByShadowText(t.unfavorited(2))).toBeInTheDocument();
    expect(screen.getByShadowRole("button", { name: ptBR.snackbar.undo })).toBeInTheDocument();
  });

  it("não tem violações de acessibilidade com filtros e barra de lote", async () => {
    state.data = many;
    const user = userEvent.setup();
    const { container } = render(wrap(<MyRecordsPage />));
    await user.click(await screen.findByShadowLabelText(t.selectRow("Liga da Ana")));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("estrela de favorito", () => {
  it("anuncia o estado, e não só o verbo do rótulo", async () => {
    // Um botão de alternância precisa dizer em que estado está: quem usa
    // leitor de tela não deveria ter de inferir isso da mudança do rótulo.
    state.data = populated;
    render(wrap(<FavoriteButton universe="material" recordId={7} />));

    const button = await screen.findByShadowRole("button", { name: t.removeFavorite });
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
  });

  it("mostra a estrela apagada para um registro que não está favoritado", async () => {
    state.data = populated;
    render(wrap(<FavoriteButton universe="material" recordId={999} />));

    const button = await screen.findByShadowRole("button", { name: t.addFavorite });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("desfavorita pelo mesmo botão", async () => {
    state.data = populated;
    const user = userEvent.setup();
    render(wrap(<FavoriteButton universe="material" recordId={7} />));

    await user.click(await screen.findByShadowRole("button", { name: t.removeFavorite }));

    await waitFor(() => expect(removeFavorite).toHaveBeenCalled());
    expect(await screen.findByShadowRole("button", { name: t.addFavorite })).toBeInTheDocument();
  });
});

describe("meus registros — Sugestão da IA (D-230b)", () => {
  const answer: SuggestionsOut = {
    tool: "registros",
    summary: "O que fazer com os seus registros.",
    suggestions: [
      {
        title: "Compare seus favoritos",
        body: "Seus materiais favoritos lado a lado mostram onde cada um se destaca.",
        actions: [
          { type: "compare", label: "Comparar 3 materiais", ids: [4, 5, 6] },
          { type: "open_route", label: "Voltar à Liga da Ana", path: "/app/materiais/7" },
          // The screen applies nothing of this type: no button that does nothing.
          { type: "set_param", label: "sem efeito aqui", name: "x", value: 1 },
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

  it("só consulta ao clicar; comparar e abrir a ficha são links, e nada é aplicado", async () => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
    state.data = populated;
    const user = userEvent.setup();
    render(wrap(<MyRecordsPage />));
    await screen.findAllByShadowRole("link", { name: "Liga da Ana" });
    expect(suggest.fn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    expect(await screen.findByRole("link", { name: "Comparar 3 materiais" })).toHaveAttribute(
      "href",
      "/app/comparar?materiais=4-6",
    );
    expect(screen.getByRole("link", { name: "Voltar à Liga da Ana" })).toHaveAttribute(
      "href",
      "/app/materiais/7",
    );
    expect(screen.queryByRole("button", { name: "sem efeito aqui" })).toBeNull();
    expect(suggest.fn).toHaveBeenCalledTimes(1);
    expect(suggest.fn).toHaveBeenCalledWith("registros", {});
    // The lists are untouched by the answer.
    expect(removeFavorite).not.toHaveBeenCalled();
  });

  it("com a IA desligada o botão diz por quê e a tela segue inteira", async () => {
    suggest.fn.mockReset();
    state.data = populated;
    const api = await import("@/lib/api");
    const spy = vi
      .spyOn(api, "getAIStatus")
      .mockResolvedValue({ enabled: false, provider: "none", simulated: false, disclaimer: "" } as never);
    render(wrap(<MyRecordsPage />));
    await screen.findAllByShadowRole("link", { name: "Liga da Ana" });
    await waitFor(() => expect(screen.getByRole("button", { name: suggestText.button })).toBeDisabled());
    expect(screen.getByText(suggestText.off)).toBeInTheDocument();
    spy.mockRestore();
  });

  it("não tem violação de acessibilidade com o painel aberto", async () => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
    state.data = populated;
    const user = userEvent.setup();
    const { container } = render(wrap(<MyRecordsPage />));
    await screen.findAllByShadowRole("link", { name: "Liga da Ana" });
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByRole("link", { name: "Comparar 3 materiais" });
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});
