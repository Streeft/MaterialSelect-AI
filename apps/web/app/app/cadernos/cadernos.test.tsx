import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Notebook, NotebookChat, NotebookSummary } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import NotebooksPage from "./page";
import { NotebookWorkspace } from "@/components/notebooks/NotebookWorkspace";

const t = ptBR.notebooks;

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/cadernos",
  useParams: () => ({ id: "4" }),
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const source = {
  id: 11,
  kind: "texto",
  title: "Aula de aços",
  origin: null,
  status: "pronto",
  error: null,
  char_count: 180,
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
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    chat_goal: "padrao",
    chat_instructions: null,
    response_length: "padrao",
    summary: {
      paragraphs: [{ text: "As fontes tratam de **aços** estruturais.", citations: [1] }],
      citations: [
        {
          number: 1,
          chunk_id: 90,
          source_id: 11,
          source_title: "Aula de aços",
          heading: null,
          page_start: null,
          page_end: null,
          excerpt: "O aço carbono tem densidade de 7850 kg/m³.",
        },
      ],
      not_found: false,
      withheld: [],
    },
    suggested_questions: ["O que as fontes dizem sobre “Aula de aços”?"],
    sources: [source],
    notes: [],
    usage: { used: 0, limit: 60, remaining: 60 },
    max_sources: 50,
    ai_enabled: true,
    ai_simulated: true,
    ai_notice: "Provedor simulado: nada sai do servidor.",
    ...overrides,
  };
}

const chat: NotebookChat = {
  question: { id: 1, role: "user", created_at: "2026-09-25T10:01:00Z", text: "Qual a densidade?", answer: null },
  answer: {
    id: 2,
    role: "assistant",
    created_at: "2026-09-25T10:01:01Z",
    text: null,
    answer: {
      paragraphs: [{ text: "O aço tem 7850 kg/m³.", citations: [1] }],
      citations: [
        {
          number: 1,
          chunk_id: 90,
          source_id: 11,
          source_title: "Aula de aços",
          heading: "Aços",
          page_start: null,
          page_end: null,
          excerpt: "O aço carbono tem densidade de 7850 kg/m³.",
        },
      ],
      not_found: false,
      withheld: ["Um trecho da resposta foi omitido porque citava números que não aparecem nas fontes citadas: 4500."],
    },
  },
  usage: { used: 1, limit: 60, remaining: 59 },
};

const api = vi.hoisted(() => ({
  listNotebooks: vi.fn(),
  createNotebook: vi.fn(),
  getNotebook: vi.fn(),
  askNotebook: vi.fn(),
  listNotebookMessages: vi.fn(),
  updateNotebookSource: vi.fn(),
  summarizeNotebook: vi.fn(),
  saveAnswerAsNote: vi.fn(),
  addNotebookText: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ...api,
  updateNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
  selectAllNotebookSources: vi.fn(),
  deleteNotebookSource: vi.fn(),
  getNotebookSource: vi.fn(() => Promise.resolve({ ...source, content: "Texto inteiro." })),
  clearNotebookMessages: vi.fn(),
  addNotebookNote: vi.fn(),
  updateNotebookNote: vi.fn(),
  deleteNotebookNote: vi.fn(),
  uploadNotebookSource: vi.fn(),
  addNotebookAppSource: vi.fn(),
  listMaterials: vi.fn(() => Promise.resolve([])),
  listStudies: vi.fn(() => Promise.resolve([])),
  // D-94: the Studio, empty — its own tests live in estudio.test.tsx.
  getStudioCatalog: vi.fn(async () => (await import("@/components/notebooks/studio/__fixtures__/studio")).studioCatalog),
  listStudio: vi.fn(() => Promise.resolve({ artifacts: [], usage: { used: 0, limit: 10, remaining: 10 } })),
  createStudioArtifact: vi.fn(),
  getStudioArtifact: vi.fn(),
  renameStudioArtifact: vi.fn(),
  deleteStudioArtifact: vi.fn(),
  saveStudioArtifactAsNote: vi.fn(),
  studioExportUrl: vi.fn(() => "#"),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getNotebook.mockResolvedValue(notebook());
  api.listNotebookMessages.mockResolvedValue([]);
  api.summarizeNotebook.mockResolvedValue(notebook());
});

describe("lista de cadernos", () => {
  it("shows each notebook with its number of sources", async () => {
    const list: NotebookSummary[] = [
      { id: 4, title: "Materiais estruturais", emoji: "📓", source_count: 2, created_at: "2026-09-25T10:00:00Z", updated_at: "2026-09-25T10:00:00Z" },
    ];
    api.listNotebooks.mockResolvedValue(list);
    render(wrap(<NotebooksPage />));
    const link = await screen.findByRole("link", { name: /Materiais estruturais/ });
    expect(link).toHaveAttribute("href", "/app/cadernos/4");
    expect(link.textContent).toContain(t.sourceCount(2));
  });

  it("creating a notebook goes straight into it", async () => {
    api.listNotebooks.mockResolvedValue([]);
    api.createNotebook.mockResolvedValue(notebook({ id: 9 }));
    const user = userEvent.setup();
    render(wrap(<NotebooksPage />));
    expect(await screen.findByText(t.emptyTitle)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: t.create })[0]!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/cadernos/9"));
  });
});

describe("caderno", () => {
  it("lays out sources, the guide with its citation, and the studio", async () => {
    render(wrap(<NotebookWorkspace id={4} />));
    expect(await screen.findByRole("heading", { name: t.panels.sources })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t.panels.chat })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t.panels.studio })).toBeInTheDocument();
    expect(screen.getByText("Provedor simulado: nada sai do servidor.")).toBeInTheDocument();
    // The guide, with its citation chip.
    expect(screen.getByText("aços").tagName).toBe("STRONG");
    expect(screen.getAllByRole("button", { name: t.citation(1, "Aula de aços") })).toHaveLength(1);
    // The text tools open "Criar …"; audio and video say they are coming.
    const report = await screen.findByRole("button", { name: new RegExp(t.studioTools.report) });
    await waitFor(() => expect(report).not.toHaveAttribute("aria-disabled"));
    const audio = screen.getByRole("button", { name: new RegExp(t.studioTools.audio) });
    expect(audio).toHaveAttribute("aria-disabled", "true");
    // A guide already written is not written again.
    expect(api.summarizeNotebook).not.toHaveBeenCalled();
  });

  it("writes the guide when there is none yet", async () => {
    api.getNotebook.mockResolvedValue(notebook({ summary: null, suggested_questions: [] }));
    render(wrap(<NotebookWorkspace id={4} />));
    await waitFor(() => expect(api.summarizeNotebook).toHaveBeenCalledTimes(1));
  });

  it("does not write a guide when the AI layer is off", async () => {
    api.getNotebook.mockResolvedValue(notebook({ summary: null, ai_enabled: false }));
    render(wrap(<NotebookWorkspace id={4} />));
    await screen.findByRole("heading", { name: t.panels.chat });
    expect(api.summarizeNotebook).not.toHaveBeenCalled();
  });

  it("asks, then shows the answer, its passage and what was withheld", async () => {
    api.askNotebook.mockResolvedValue(chat);
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    const box = await screen.findByRole("textbox", { name: t.askLabel });
    await user.type(box, "Qual a densidade?{Enter}");
    expect(api.askNotebook).toHaveBeenCalledWith(4, "Qual a densidade?");

    expect(await screen.findByText("O aço tem 7850 kg/m³.")).toBeInTheDocument();
    expect(screen.getByText(t.withheldTitle)).toBeInTheDocument();
    const chips = screen.getAllByRole("button", { name: t.citation(1, "Aula de aços") });
    await user.click(chips[chips.length - 1]!);
    const panel = screen.getByRole("dialog", { name: t.citation(1, "Aula de aços") });
    expect(within(panel).getByText("O aço carbono tem densidade de 7850 kg/m³.")).toBeInTheDocument();
    expect(within(panel).getByText("Aços")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(t.usage(1, 60)))).toBeInTheDocument();
  });

  it("a suggested question is asked in one click", async () => {
    api.askNotebook.mockResolvedValue(chat);
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: "O que as fontes dizem sobre “Aula de aços”?" }));
    expect(api.askNotebook).toHaveBeenCalledWith(4, "O que as fontes dizem sobre “Aula de aços”?");
  });

  it("unmarking a source asks the server, and with none marked the question box says why", async () => {
    api.updateNotebookSource.mockResolvedValue({ ...source, selected: false });
    const user = userEvent.setup();
    const view = render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("checkbox", { name: t.useSource("Aula de aços") }));
    expect(api.updateNotebookSource).toHaveBeenCalledWith(4, 11, { selected: false });

    api.getNotebook.mockResolvedValue(notebook({ sources: [{ ...source, selected: false }] }));
    view.unmount();
    render(wrap(<NotebookWorkspace id={4} />));
    const box = await screen.findByRole("textbox", { name: t.askLabel });
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("placeholder", t.noSelected);
  });

  it("an answer can be saved as a note", async () => {
    api.listNotebookMessages.mockResolvedValue([chat.question, chat.answer]);
    api.saveAnswerAsNote.mockResolvedValue({});
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.saveNote }));
    expect(api.saveAnswerAsNote).toHaveBeenCalledWith(4, 2);
    expect(await screen.findByText(t.savedNote)).toBeInTheDocument();
  });

  it("pasted text becomes a source", async () => {
    api.addNotebookText.mockResolvedValue(source);
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: t.addSources }));
    await user.click(screen.getByRole("tab", { name: t.tabText }));
    await user.type(screen.getByRole("textbox", { name: t.textBody }), "Cerâmicas são frágeis.");
    await user.click(screen.getByRole("button", { name: t.addText }));
    await waitFor(() =>
      expect(api.addNotebookText).toHaveBeenCalledWith(4, t.textTitleDefault, "Cerâmicas são frágeis."),
    );
  });
});
