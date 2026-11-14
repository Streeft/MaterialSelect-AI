import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import type { Notebook, NotebookSummary } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { installWideViewport } from "@/lib/testing/viewport";
import { allowLoadedRunner } from "@/lib/testing/loadedRunner";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import NotebooksPage from "./page";
import { NotebookWorkspace } from "@/components/notebooks/NotebookWorkspace";

// Long, CPU-bound jsdom walks: see lib/testing/loadedRunner.ts.
allowLoadedRunner();
installWideViewport();
const t = ptBR.notebooks;

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/cadernos/4",
  useParams: () => ({ id: "4" }),
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const CONTENT =
  "Introdução.\n\nO aço carbono tem densidade de 7850 kg/m³ e módulo de elasticidade de 210 GPa.\n\nFim.";
const EXCERPT = "O aço carbono tem densidade de 7850 kg/m³ e módulo de elasticidade de 210 GPa.";

const source = {
  id: 11,
  kind: "texto",
  title: "Aula de aços",
  origin: null,
  status: "pronto",
  error: null,
  char_count: CONTENT.length,
  page_count: null,
  selected: true,
  truncated: false,
  created_at: "2026-09-25T10:00:00Z",
};

function notebook(overrides: Partial<Notebook> = {}): Notebook {
  return {
    id: 4,
    title: "Materiais estruturais",
    emoji: "📓",
    archived: false,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    chat_goal: "padrao",
    chat_instructions: null,
    response_length: "padrao",
    summary: {
      paragraphs: [{ text: "As fontes tratam de aços.", citations: [1] }],
      citations: [
        {
          number: 1,
          chunk_id: 90,
          source_id: 11,
          source_title: "Aula de aços",
          heading: null,
          page_start: null,
          page_end: null,
          excerpt: EXCERPT,
        },
      ],
      not_found: false,
      withheld: [],
    },
    suggested_questions: [],
    sources: [source],
    notes: [],
    usage: { used: 0, limit: 60, remaining: 60 },
    fetch_usage: { used: 0, limit: 30, remaining: 30 },
    max_sources: 50,
    ai_enabled: true,
    ai_simulated: true,
    ai_notice: "Provedor simulado: nada sai do servidor.",
    ...overrides,
  };
}

const api = vi.hoisted(() => ({
  listNotebooks: vi.fn(),
  listNotebookTemplates: () => Promise.resolve([]),
  createNotebook: vi.fn(),
  getNotebook: vi.fn(),
  updateNotebook: vi.fn(),
  duplicateNotebook: vi.fn(),
  batchArchiveNotebooks: vi.fn(),
  emptyNotebookArchive: vi.fn(),
  deleteNotebook: vi.fn(),
  getNotebookSource: vi.fn(),
  listNotebookMessages: vi.fn(),
  summarizeNotebook: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    ...api,
    selectAllNotebookSources: vi.fn(),
    updateNotebookSource: vi.fn(),
    deleteNotebookSource: vi.fn(),
    askNotebook: vi.fn(),
    saveAnswerAsNote: vi.fn(),
    getStudioCatalog: vi.fn(async () => (await import("@/components/notebooks/studio/__fixtures__/studio")).studioCatalog),
    listStudio: vi.fn(() => Promise.resolve({ artifacts: [], usage: { used: 0, limit: 10, remaining: 10 } })),
    getSourceCapabilities: vi.fn(() =>
      Promise.resolve({
        link: { enabled: true, reason: null },
        youtube: { enabled: true, reason: null },
        openalex: { enabled: false, reason: "Sem chave do OpenAlex." },
        wikipedia: { enabled: true, reason: null },
        web: { enabled: false, reason: "Busca na web desligada." },
      }),
    ),
  };
});

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>
  );
}

function summary(overrides: Partial<NotebookSummary> = {}): NotebookSummary {
  return {
    id: 4,
    title: "Materiais estruturais",
    emoji: "📓",
    archived: false,
    source_count: 1,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/app/cadernos/4");
  api.getNotebook.mockResolvedValue(notebook());
  api.listNotebookMessages.mockResolvedValue([]);
  api.summarizeNotebook.mockResolvedValue(notebook());
  api.getNotebookSource.mockResolvedValue({ ...source, content: CONTENT });
});

describe("endereço do caderno (D-218)", () => {
  it("opens on the panel the address names, and choosing another writes it back", async () => {
    window.history.replaceState(null, "", "/app/cadernos/4?aba=fontes");
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    const tabs = await screen.findByRole("group", { name: t.panelTabs });
    expect(within(tabs).getByRole("button", { name: t.panels.sources })).toHaveAttribute("aria-pressed", "true");
    expect(within(tabs).getByRole("button", { name: t.panels.chat })).toHaveAttribute("aria-pressed", "false");

    await user.click(within(tabs).getByRole("button", { name: t.panels.studio }));
    expect(window.location.search).toBe("?aba=estudio");
    // The default panel leaves the address clean.
    await user.click(within(tabs).getByRole("button", { name: t.panels.chat }));
    expect(window.location.search).toBe("");
  });

  it("a malformed panel falls back to the conversation, never throws", async () => {
    window.history.replaceState(null, "", "/app/cadernos/4?aba=banana&fonte=abc");
    render(wrap(<NotebookWorkspace id={4} />));
    const tabs = await screen.findByRole("group", { name: t.panelTabs });
    expect(within(tabs).getByRole("button", { name: t.panels.chat })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("?fonte= opens that source in the reader and closing it clears the address", async () => {
    window.history.replaceState(null, "", "/app/cadernos/4?fonte=11");
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    const reader = await screen.findByRole("dialog", { name: "Aula de aços" });
    expect(await within(reader).findByText(/Introdução\./)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("a ?fonte= that is not a source of this notebook is dropped from the address", async () => {
    window.history.replaceState(null, "", "/app/cadernos/4?fonte=999&aba=estudio");
    render(wrap(<NotebookWorkspace id={4} />));
    await screen.findByRole("group", { name: t.panelTabs });
    await waitFor(() => expect(window.location.search).toBe("?aba=estudio"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("citação abre a fonte no trecho (D-218)", () => {
  it("opens the source, marks the cited passage and puts the source in the address", async () => {
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.citation(1, "Aula de aços") }));
    await user.click(screen.getByRole("button", { name: t.openAtPassageLabel("Aula de aços") }));

    const reader = await screen.findByRole("dialog", { name: "Aula de aços" });
    const mark = await within(reader).findByText(EXCERPT);
    expect(mark.tagName).toBe("MARK");
    expect(window.location.search).toBe("?fonte=11");
    // Found in the text: no "not found" notice.
    expect(within(reader).queryByText(t.reader.passageNotFound)).toBeNull();
  });

  it("with the server's position it marks that stretch and keeps the range in the address (D-233)", async () => {
    const start = CONTENT.indexOf(EXCERPT);
    const end = start + EXCERPT.length;
    const base = notebook();
    api.getNotebook.mockResolvedValue({
      ...base,
      summary: {
        ...base.summary!,
        citations: [{ ...base.summary!.citations[0]!, char_start: start, char_end: end }],
      },
    });
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.citation(1, "Aula de aços") }));
    await user.click(screen.getByRole("button", { name: t.openAtPassageLabel("Aula de aços") }));

    const reader = await screen.findByRole("dialog", { name: "Aula de aços" });
    const mark = await within(reader).findByText(EXCERPT);
    expect(mark.tagName).toBe("MARK");
    expect(window.location.search).toBe(`?fonte=11&trecho=${start}-${end}`);
  });

  it("a reload on ?fonte=&trecho= marks the passage with no excerpt at hand (D-233)", async () => {
    const start = CONTENT.indexOf(EXCERPT);
    const end = start + EXCERPT.length;
    window.history.replaceState(null, "", `/app/cadernos/4?fonte=11&trecho=${start}-${end}`);
    render(wrap(<NotebookWorkspace id={4} />));
    const reader = await screen.findByRole("dialog", { name: "Aula de aços" });
    const mark = await within(reader).findByText(EXCERPT);
    expect(mark.tagName).toBe("MARK");
  });

  it("a ?trecho= with no source is dropped from the address (D-233)", async () => {
    window.history.replaceState(null, "", "/app/cadernos/4?trecho=3-9");
    render(wrap(<NotebookWorkspace id={4} />));
    await screen.findByRole("group", { name: t.panelTabs });
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("when the passage is not in the text it says so and still shows it", async () => {
    api.getNotebookSource.mockResolvedValue({ ...source, content: "Outro texto qualquer." });
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.citation(1, "Aula de aços") }));
    await user.click(screen.getByRole("button", { name: t.openAtPassageLabel("Aula de aços") }));
    const reader = await screen.findByRole("dialog", { name: "Aula de aços" });
    expect(await within(reader).findByText(t.reader.passageNotFound)).toBeInTheDocument();
    expect(within(reader).getByText(EXCERPT)).toBeInTheDocument();
    expect(reader.querySelector("mark")).toBeNull();
  });

  it("a citation whose source left the notebook has nothing to open", async () => {
    api.getNotebook.mockResolvedValue(notebook({ sources: [{ ...source, id: 12, title: "Outra" }] }));
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.citation(1, "Aula de aços") }));
    expect(screen.queryByRole("button", { name: t.openAtPassageLabel("Aula de aços") })).toBeNull();
  });
});

describe("carregando, vazio e erro (D-218)", () => {
  it("shows the shape of the workspace while the notebook loads", async () => {
    api.getNotebook.mockReturnValue(new Promise(() => {}));
    const { container } = render(wrap(<NotebookWorkspace id={4} />));
    expect(await screen.findByRole("status", { name: t.loadingNotebook })).toBeInTheDocument();
    expect(container.querySelectorAll(".msds-skeleton").length).toBeGreaterThanOrEqual(3);
  });

  it("an error says what happened in words and 'Tentar novamente' fetches again", async () => {
    api.getNotebook.mockRejectedValueOnce(new ApiError("Internal Server Error: sqlalchemy.exc", 500));
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("sqlalchemy");
    await user.click(within(alert).getByRole("button", { name: ptBR.ui.retry }));
    expect(await screen.findByRole("heading", { name: t.panels.chat })).toBeInTheDocument();
    expect(api.getNotebook).toHaveBeenCalledTimes(2);
  });

  it("the list: an error offers retry; an empty archive says so", async () => {
    api.listNotebooks.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(wrap(<NotebooksPage />));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("Failed to fetch");
    api.listNotebooks.mockResolvedValue([]);
    await user.click(within(alert).getByRole("button", { name: ptBR.ui.retry }));
    expect(await screen.findByText(t.emptyTitle)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.viewArchived }));
    expect(await screen.findByText(t.archivedEmptyTitle)).toBeInTheDocument();
    // The header's button is the only one: an archive has no "create" of its own.
    expect(screen.getAllByRole("button", { name: t.create })).toHaveLength(1);
  });
});

describe("cabeçalho do caderno: ações (D-218)", () => {
  it("has one primary, the quiet secondary and the ⋯ menu with rename, duplicate, archive and delete", async () => {
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    const actions = await screen.findByRole("group", { name: ptBR.ui.pageActions });
    expect(within(actions).getByRole("button", { name: t.addSources })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: t.settings })).toBeInTheDocument();
    await user.click(within(actions).getByRole("button", { name: t.notebookActions }));
    for (const name of [t.rename, t.duplicate, t.archive, t.remove]) {
      expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
    }
  });

  it("renames from the menu in a dialog and sends the trimmed title", async () => {
    api.updateNotebook.mockResolvedValue(notebook({ title: "Ligas leves" }));
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.notebookActions }));
    await user.click(await screen.findByRole("menuitem", { name: t.rename }));
    const dialog = await screen.findByRole("dialog", { name: t.renameTitle });
    const input = within(dialog).getByRole("textbox", { name: t.titleLabel });
    await user.clear(input);
    await user.type(input, "  Ligas leves {Enter}");
    await waitFor(() => expect(api.updateNotebook).toHaveBeenCalledWith(4, { title: "Ligas leves" }));
  });

  it("duplicates and goes into the copy", async () => {
    api.duplicateNotebook.mockResolvedValue(notebook({ id: 9, title: "Cópia de Materiais estruturais" }));
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.notebookActions }));
    await user.click(await screen.findByRole("menuitem", { name: t.duplicate }));
    await waitFor(() => expect(api.duplicateNotebook).toHaveBeenCalledWith(4, false));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/cadernos/9"));
  });

  it("archives with a way back, and an archived notebook says so and offers to restore", async () => {
    api.updateNotebook.mockResolvedValue(notebook({ archived: true }));
    const user = userEvent.setup();
    const view = render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.notebookActions }));
    await user.click(await screen.findByRole("menuitem", { name: t.archive }));
    await waitFor(() => expect(api.updateNotebook).toHaveBeenCalledWith(4, { archived: true }));
    expect(await screen.findByRole("button", { name: ptBR.snackbar.undo })).toBeInTheDocument();
    view.unmount();

    api.getNotebook.mockResolvedValue(notebook({ archived: true }));
    render(wrap(<NotebookWorkspace id={4} />));
    expect(await screen.findByText(t.archivedBanner)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: t.notebookActions }));
    expect(await screen.findByRole("menuitem", { name: t.unarchive })).toBeInTheDocument();
  });
});

describe("lista: duplicar, arquivar e ver os arquivados (D-218)", () => {
  it("the card menu duplicates and archives", async () => {
    api.listNotebooks.mockResolvedValue([summary()]);
    api.duplicateNotebook.mockResolvedValue(notebook({ id: 9 }));
    api.updateNotebook.mockResolvedValue(notebook({ archived: true }));
    const user = userEvent.setup();
    render(wrap(<NotebooksPage />));
    const open = async () =>
      user.click(await screen.findByRole("button", { name: t.cardMenu("Materiais estruturais") }));
    await open();
    await user.click(await screen.findByRole("menuitem", { name: t.duplicate }));
    await waitFor(() => expect(api.duplicateNotebook).toHaveBeenCalledWith(4, false));
    await open();
    await user.click(await screen.findByRole("menuitem", { name: t.archive }));
    await waitFor(() => expect(api.updateNotebook).toHaveBeenCalledWith(4, { archived: true }));
  });

  it("'Arquivados' asks the server for them, keeps it in the address, and offers Desarquivar", async () => {
    window.history.replaceState(null, "", "/app/cadernos");
    api.listNotebooks.mockImplementation((archived?: boolean) =>
      Promise.resolve(archived ? [summary({ id: 7, title: "Velho", archived: true })] : [summary()]),
    );
    const user = userEvent.setup();
    render(wrap(<NotebooksPage />));
    await screen.findByRole("link", { name: /Materiais estruturais/ });
    await user.click(screen.getByRole("button", { name: t.viewArchived }));
    expect(await screen.findByRole("link", { name: /Velho/ })).toBeInTheDocument();
    expect(window.location.search).toBe("?arquivados=1");
    await user.click(screen.getByRole("button", { name: t.cardMenu("Velho") }));
    expect(await screen.findByRole("menuitem", { name: t.unarchive })).toBeInTheDocument();
  });
});

describe("duplicar com conversa e arquivar em lote (D-233)", () => {
  const c = curadoriaText.notebooks;

  it("the card menu offers 'Duplicar com conversa' and asks the server to carry it", async () => {
    api.listNotebooks.mockResolvedValue([summary()]);
    api.duplicateNotebook.mockResolvedValue(notebook({ id: 9 }));
    const user = userEvent.setup();
    render(wrap(<NotebooksPage />));
    await user.click(await screen.findByRole("button", { name: t.cardMenu("Materiais estruturais") }));
    await user.click(await screen.findByRole("menuitem", { name: new RegExp(`^${c.duplicateWithChat}`) }));
    await waitFor(() => expect(api.duplicateNotebook).toHaveBeenCalledWith(4, true));
  });

  it("the notebook's own menu has it too, and goes into the copy", async () => {
    api.duplicateNotebook.mockResolvedValue(notebook({ id: 9, title: "Cópia de Materiais estruturais" }));
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.notebookActions }));
    await user.click(await screen.findByRole("menuitem", { name: new RegExp(`^${c.duplicateWithChat}`) }));
    await waitFor(() => expect(api.duplicateNotebook).toHaveBeenCalledWith(4, true));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/cadernos/9"));
  });

  const two = () => [
    summary({ id: 4, title: "Aços" }),
    summary({ id: 5, title: "Polímeros" }),
    summary({ id: 6, title: "Cerâmicas" }),
  ];

  it("selection mode shows a box per card, and the bar acts only after a confirmation", async () => {
    window.history.replaceState(null, "", "/app/cadernos");
    api.listNotebooks.mockResolvedValue(two());
    api.batchArchiveNotebooks.mockResolvedValue([]);
    const user = userEvent.setup();
    render(wrap(<NotebooksPage />));
    await screen.findByRole("link", { name: /Aços/ });
    // No boxes and no bar until the reader asks for selection.
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: c.select }));
    expect(screen.getByRole("button", { name: c.selectDone })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("checkbox", { name: c.selectRow("Aços") }));
    await user.click(screen.getByRole("checkbox", { name: c.selectRow("Polímeros") }));
    expect(screen.getByText(c.selected(2))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: c.archiveSelected }));
    const dialog = await screen.findByRole("dialog", { name: c.confirmArchiveTitle(2) });
    expect(api.batchArchiveNotebooks).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: c.archiveSelected }));

    await waitFor(() => expect(api.batchArchiveNotebooks).toHaveBeenCalledWith([4, 5], true));
    // The snackbar says what happened and offers the way back.
    expect(await screen.findByText(c.archivedMany(2))).toBeInTheDocument();
    api.batchArchiveNotebooks.mockClear();
    await user.click(screen.getByRole("button", { name: ptBR.snackbar.undo }));
    await waitFor(() => expect(api.batchArchiveNotebooks).toHaveBeenCalledWith([4, 5], false));
  });

  it("cancelling the confirmation changes nothing", async () => {
    window.history.replaceState(null, "", "/app/cadernos");
    api.listNotebooks.mockResolvedValue(two());
    api.batchArchiveNotebooks.mockReset();
    const user = userEvent.setup();
    render(wrap(<NotebooksPage />));
    await screen.findByRole("link", { name: /Aços/ });
    await user.click(screen.getByRole("button", { name: c.select }));
    await user.click(screen.getByRole("checkbox", { name: c.selectRow("Aços") }));
    await user.click(screen.getByRole("button", { name: c.archiveSelected }));
    const dialog = await screen.findByRole("dialog", { name: c.confirmArchiveTitle(1) });
    await user.click(within(dialog).getByRole("button", { name: ptBR.actions.cancel }));
    expect(api.batchArchiveNotebooks).not.toHaveBeenCalled();
  });

  it("'Selecionar todos' picks every card, and in the archive the verb is 'Desarquivar selecionados'", async () => {
    window.history.replaceState(null, "", "/app/cadernos?arquivados=1");
    api.listNotebooks.mockImplementation((archived?: boolean) =>
      Promise.resolve(
        archived
          ? [summary({ id: 7, title: "Velho", archived: true }), summary({ id: 8, title: "Antigo", archived: true })]
          : [],
      ),
    );
    api.batchArchiveNotebooks.mockResolvedValue([]);
    const user = userEvent.setup();
    render(wrap(<NotebooksPage />));
    await screen.findByRole("link", { name: /Velho/ });
    await user.click(screen.getByRole("button", { name: c.select }));
    await user.click(screen.getByRole("button", { name: c.selectAll }));
    expect(screen.getByText(c.selected(2))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: c.unarchiveSelected }));
    const dialog = await screen.findByRole("dialog", { name: c.confirmUnarchiveTitle(2) });
    await user.click(within(dialog).getByRole("button", { name: c.unarchiveSelected }));
    await waitFor(() => expect(api.batchArchiveNotebooks).toHaveBeenCalledWith([7, 8], false));
    window.history.replaceState(null, "", "/app/cadernos");
  });

  it("a failure says nothing was changed, in words", async () => {
    window.history.replaceState(null, "", "/app/cadernos");
    api.listNotebooks.mockResolvedValue(two());
    api.batchArchiveNotebooks.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    render(wrap(<NotebooksPage />));
    await screen.findByRole("link", { name: /Aços/ });
    await user.click(screen.getByRole("button", { name: c.select }));
    await user.click(screen.getByRole("checkbox", { name: c.selectRow("Aços") }));
    await user.click(screen.getByRole("button", { name: c.archiveSelected }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: c.archiveSelected }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  describe("Esvaziar o arquivo (D-236)", () => {
    const archived = () => [
      summary({ id: 7, title: "Velho", archived: true }),
      summary({ id: 8, title: "Antigo", archived: true }),
    ];
    const openArchive = () => {
      window.history.replaceState(null, "", "/app/cadernos?arquivados=1");
      api.listNotebooks.mockImplementation((isArchived?: boolean) =>
        Promise.resolve(isArchived ? archived() : []),
      );
    };

    it("só aparece na aba de arquivados, e só quando há o que apagar", async () => {
      window.history.replaceState(null, "", "/app/cadernos");
      api.listNotebooks.mockResolvedValue(two());
      render(wrap(<NotebooksPage />));
      await screen.findByRole("link", { name: /Aços/ });
      expect(screen.queryByRole("button", { name: c.emptyArchive })).toBeNull();
    });

    it("pede confirmação com a contagem e só então apaga, mandando a contagem confirmada", async () => {
      openArchive();
      api.emptyNotebookArchive.mockResolvedValue({ deleted: 2 });
      const user = userEvent.setup();
      render(wrap(<NotebooksPage />));
      await screen.findByRole("link", { name: /Velho/ });

      await user.click(screen.getByRole("button", { name: c.emptyArchive }));
      const dialog = await screen.findByRole("dialog", { name: c.emptyArchiveTitle(2) });
      expect(within(dialog).getByText(c.emptyArchiveMessage)).toBeInTheDocument();
      expect(api.emptyNotebookArchive).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: c.emptyArchiveConfirm }));
      await waitFor(() => expect(api.emptyNotebookArchive).toHaveBeenCalledWith(2));
      expect(await screen.findByText(c.emptiedArchive(2))).toBeInTheDocument();
    });

    it("cancelar não apaga nada", async () => {
      openArchive();
      const user = userEvent.setup();
      render(wrap(<NotebooksPage />));
      await screen.findByRole("link", { name: /Velho/ });
      await user.click(screen.getByRole("button", { name: c.emptyArchive }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: ptBR.actions.cancel }));
      expect(api.emptyNotebookArchive).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("se o arquivo mudou (409), escreve o motivo e recarrega a lista", async () => {
      openArchive();
      api.emptyNotebookArchive.mockRejectedValue(
        new ApiError("O arquivo mudou: a confirmação era de 2 e agora há 3. Recarregue a lista.", 409),
      );
      const user = userEvent.setup();
      render(wrap(<NotebooksPage />));
      await screen.findByRole("link", { name: /Velho/ });
      const before = api.listNotebooks.mock.calls.length;
      await user.click(screen.getByRole("button", { name: c.emptyArchive }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: c.emptyArchiveConfirm }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/O arquivo mudou/);
      await waitFor(() => expect(api.listNotebooks.mock.calls.length).toBeGreaterThan(before));
    });

    it("uma falha sem texto legível diz que nenhum caderno foi apagado", async () => {
      openArchive();
      api.emptyNotebookArchive.mockRejectedValue(new Error("falhou"));
      const user = userEvent.setup();
      render(wrap(<NotebooksPage />));
      await screen.findByRole("link", { name: /Velho/ });
      await user.click(screen.getByRole("button", { name: c.emptyArchive }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: c.emptyArchiveConfirm }));
      expect(await screen.findByRole("alert")).toHaveTextContent(c.emptyArchiveFailed);
    });

    it("a aba de arquivados com o botão e o diálogo não tem violações", async () => {
      openArchive();
      const user = userEvent.setup();
      const view = render(wrap(<NotebooksPage />));
      await screen.findByRole("link", { name: /Velho/ });
      await user.click(screen.getByRole("button", { name: c.emptyArchive }));
      await screen.findByRole("dialog");
      // The MSDS dialog titles itself with an h3 in every dialog of the app (a library choice), which
      // axe reads as a skipped level under the page's h1: that one rule is set aside, as elsewhere.
      const violations = await findA11yViolations(view.container, {
        rules: { "heading-order": { enabled: false } },
      });
      expect(violations, describeViolations(violations)).toEqual([]);
    });

    afterEach(() => window.history.replaceState(null, "", "/app/cadernos"));
  });

  it("the list with the selection bar open has no violations", async () => {
    window.history.replaceState(null, "", "/app/cadernos");
    api.listNotebooks.mockResolvedValue(two());
    const user = userEvent.setup();
    const view = render(wrap(<NotebooksPage />));
    await screen.findByRole("link", { name: /Aços/ });
    await user.click(screen.getByRole("button", { name: c.select }));
    await user.click(screen.getByRole("checkbox", { name: c.selectRow("Aços") }));
    const violations = await findA11yViolations(view.container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("acessibilidade (axe)", () => {
  it("the notebook and the list have no violations", async () => {
    const view = render(wrap(<NotebookWorkspace id={4} />));
    await screen.findByRole("heading", { name: t.panels.chat });
    const workspace = await findA11yViolations(view.container);
    expect(workspace, describeViolations(workspace)).toEqual([]);
    view.unmount();

    window.history.replaceState(null, "", "/app/cadernos");
    api.listNotebooks.mockResolvedValue([summary()]);
    const list = render(wrap(<NotebooksPage />));
    await screen.findByRole("link", { name: /Materiais estruturais/ });
    const violations = await findA11yViolations(list.container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
