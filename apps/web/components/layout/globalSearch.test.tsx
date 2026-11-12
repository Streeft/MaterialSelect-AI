import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalSearchButton } from "./GlobalSearch";
import { ptBR } from "@/lib/i18n";
import { OPEN_SHORTCUTS_EVENT } from "@/lib/shortcuts";
import { RECENTS_KEY } from "@/lib/navMemory";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";

const t = ptBR.palette;

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push }),
}));

/** The server's answer for each query, already ranked (D-207). */
const HITS: Record<string, unknown[]> = {
  aço: [
    { kind: "material", id: 7, name: "Aço inoxidável 304", class_name: "Metais", slug: null },
    { kind: "material", id: 9, name: "Liga de aço", class_name: "Metais", slug: null },
    { kind: "material", id: 3, name: "Argamassa Traço 1:3", class_name: "Cerâmicas", slug: null },
  ],
  metais: [
    { kind: "material", id: 7, name: "Aço inoxidável 304", class_name: "Metais", slug: null },
    { kind: "material", id: 8, name: "Alumínio 6061", class_name: "Metais", slug: null },
  ],
  fundicao: [
    { kind: "process", id: 1, name: "Fundição em areia", class_name: "Moldagem", slug: "fundicao" },
  ],
};

const quickSearch = vi.fn((q: string) => Promise.resolve({ items: HITS[q] ?? [] }));
const listMaterials = vi.fn(() => Promise.resolve([]));
const getMyRecords = vi.fn(() =>
  Promise.resolve({
    favorites: [
      { universe: "material", at: "", material: { id: 4 }, process: null },
      { universe: "material", at: "", material: { id: 5 }, process: null },
    ],
    recents: [],
    own_records: [],
  }),
);

vi.mock("@/lib/api", () => ({
  getBillingStatus: () =>
    Promise.resolve({
      active: true,
      status: null,
      current_period_end: null,
      access_mode: "subscription",
      has_access: true,
      can_edit_catalog: true,
    }),
  quickSearch: (q: string) => quickSearch(q),
  listMaterials: () => listMaterials(),
  getMyRecords: () => getMyRecords(),
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <input aria-label="campo de texto" />
      <GlobalSearchButton />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  quickSearch.mockClear();
  listMaterials.mockClear();
  getMyRecords.mockClear();
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
});

describe("GlobalSearch (D-129)", () => {
  it("opens with Ctrl+K, lists the screens and closes with Escape", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    const dialog = screen.getByRole("dialog", { name: t.title });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("option", { name: new RegExp(t.goTo(ptBR.nav.selection)) })).toBeInTheDocument();
    // No query: the catalogue is not offered as a suggestion.
    expect(screen.queryByRole("option", { name: /Alumínio/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("finds a material ignoring case and accents, and opens it with Enter", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: new RegExp(t.open) }));
    const input = screen.getByRole("combobox");
    await user.type(input, "aço");
    expect(await screen.findByRole("option", { name: /Aço inoxidável 304/ })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/app/materiais/7");
  });

  it("moves the highlight with the arrow keys and reports it by aria-activedescendant", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("/");
    const input = screen.getByRole("combobox");
    await user.type(input, "metais");
    await screen.findByRole("option", { name: /Alumínio 6061/ });
    const options = screen.getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", options[0]!.id);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1]!.id);
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/app/materiais/8");
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "zzzz");
    expect(await screen.findByText(t.empty)).toBeInTheDocument();
  });

  it("does not steal the slash while the reader types in a field", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByLabelText("campo de texto"));
    await user.keyboard("a/b");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("campo de texto")).toHaveValue("a/b");
  });

  it("monta o diálogo no body, fora da barra que o abre (D-170)", async () => {
    // A barra de cima tem `backdrop-filter`, que vira o bloco de contenção de todo
    // `position: fixed` dentro dela; o diálogo ficaria preso numa faixa de 56 px.
    const user = userEvent.setup();
    const { container } = setup();
    await user.keyboard("{Control>}k{/Control}");

    const dialog = screen.getByRole("dialog", { name: t.title });
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.closest(".msds-dialog-backdrop")?.parentElement).toBe(document.body);
  });

  it("cada tela da lista leva o ícone que tem na barra lateral", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");

    const catalog = screen.getByRole("option", { name: new RegExp(t.goTo(ptBR.nav.catalog)) });
    const home = screen.getByRole("option", { name: new RegExp(t.goTo(ptBR.nav.home)) });
    expect(catalog.querySelector("svg")?.innerHTML).not.toBe(home.querySelector("svg")?.innerHTML);
  });

  it("has no accessibility violations while open", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog");
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("busca leve no servidor (D-207)", () => {
  it("abrir a paleta não baixa o catálogo", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog");
    expect(listMaterials).not.toHaveBeenCalled();
    expect(quickSearch).not.toHaveBeenCalled();
  });

  it("pergunta ao servidor uma vez, depois da pausa, e mantém a ordem dele", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "aço");
    await screen.findByRole("option", { name: /Argamassa/ });
    // Three keystrokes, one request: the debounce waits for the pause.
    expect(quickSearch).toHaveBeenCalledTimes(1);
    expect(quickSearch).toHaveBeenCalledWith("aço");
    const names = screen
      .getAllByRole("option")
      .map((o) => o.textContent ?? "")
      .filter((text) => /Aço|aço|Traço/.test(text));
    expect(names[0]).toMatch(/^Aço inoxidável 304/);
    expect(names.findIndex((n) => n.startsWith("Argamassa"))).toBeGreaterThan(0);
  });

  it("um processo abre pela página do slug", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "fundicao");
    await user.click(await screen.findByRole("option", { name: /Fundição em areia/ }));
    expect(push).toHaveBeenCalledWith("/app/processos/fundicao");
  });

  it("avisa quando a busca falha, sem esconder as ações", async () => {
    quickSearch.mockImplementationOnce(() => Promise.reject(new Error("rede")));
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "mapa");
    expect(await screen.findByText(t.error)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: t.actionMapEDensity })).toBeInTheDocument();
  });
});

describe("ações da paleta (D-207)", () => {
  async function runAction(name: string) {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.click(screen.getByRole("option", { name }));
    return user;
  }

  it("Nova seleção abre o assistente", async () => {
    await runAction(t.actionNewSelection);
    expect(push).toHaveBeenCalledWith("/app/selecao");
  });

  it("Abrir mapa E × ρ abre o mapa com densidade em x e módulo de Young em y", async () => {
    await runAction(t.actionMapEDensity);
    expect(push).toHaveBeenCalledWith("/app/mapas?x=densidade&y=modulo_young");
  });

  it("Comparar favoritos leva os favoritos ao comparador", async () => {
    await runAction(t.actionCompareFavorites);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/app/comparar?materiais=4,5"));
  });

  it("Comparar favoritos sem favoritos explica e não fecha", async () => {
    getMyRecords.mockImplementationOnce(() =>
      Promise.resolve({ favorites: [], recents: [], own_records: [] }),
    );
    await runAction(t.actionCompareFavorites);
    expect(await screen.findByText(t.noFavorites)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: t.title })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("alternar tema troca claro por escuro", async () => {
    await runAction(t.actionToggleTheme);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("Ver atalhos pede a lista de atalhos", async () => {
    const opened = vi.fn();
    window.addEventListener(OPEN_SHORTCUTS_EVENT, opened);
    await runAction(t.actionShortcuts);
    await vi.waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
    window.removeEventListener(OPEN_SHORTCUTS_EVENT, opened);
  });

  it("acha uma ação pelo que ela faz", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "tema");
    expect(screen.getByRole("option", { name: t.actionToggleTheme })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: t.actionNewSelection })).not.toBeInTheDocument();
  });

  it("sem busca, mostra as páginas recentes primeiro", async () => {
    window.localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify([{ href: "/app/materiais/7", label: "Aço inoxidável 304" }]),
    );
    const user = userEvent.setup();
    setup();
    await act(async () => {
      await user.keyboard("{Control>}k{/Control}");
    });
    const first = screen.getAllByRole("option")[0]!;
    expect(first).toHaveTextContent("Aço inoxidável 304");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/app/materiais/7");
  });
});
