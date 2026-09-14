import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
// The star is an `md-icon-button`, so it lives in a shadow root — the whole
// file uses the shadow-aware queries rather than mixing two `screen`s.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MaterialListItem, MyRecords, Process } from "@/lib/types";
import { ptBR } from "@/lib/i18n";

const t = ptBR.myRecords;

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/meus-registros",
  useParams: () => ({}),
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

vi.mock("@/lib/api", () => ({
  getMyRecords: () => Promise.resolve(state.data),
  addFavorite: () => Promise.resolve(state.data),
  removeFavorite: () => removeFavorite(),
  touchRecent: () => Promise.resolve(undefined),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
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
