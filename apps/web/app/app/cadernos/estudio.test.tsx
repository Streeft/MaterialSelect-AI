import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Notebook } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { NotebookWorkspace } from "@/components/notebooks/NotebookWorkspace";
import {
  artifactById,
  failedArtifact,
  flashcardsArtifact,
  mindmapArtifact,
  quizArtifact,
  reportArtifact,
  runningArtifact,
  studioCatalog,
  studioList,
  tableArtifact,
} from "@/components/notebooks/studio/__fixtures__/studio";

const t = ptBR.notebooks;
const s = t.studio;

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/cadernos/4",
  useParams: () => ({ id: "4" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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

const notebook: Notebook = {
  id: 4,
  title: "Materiais estruturais",
  emoji: "📓",
  created_at: "2026-09-25T10:00:00Z",
  updated_at: "2026-09-25T10:00:00Z",
  chat_goal: "padrao",
  chat_instructions: null,
  response_length: "padrao",
  summary: { paragraphs: [], citations: [], not_found: false, withheld: [] },
  suggested_questions: [],
  sources: [source],
  notes: [],
  usage: { used: 0, limit: 60, remaining: 60 },
  fetch_usage: { used: 0, limit: 30, remaining: 30 },
  max_sources: 50,
  ai_enabled: true,
  ai_simulated: true,
  ai_notice: "Provedor simulado.",
};

const api = vi.hoisted(() => ({
  listStudio: vi.fn(),
  createStudioArtifact: vi.fn(),
  getStudioArtifact: vi.fn(),
  deleteStudioArtifact: vi.fn(),
  saveStudioArtifactAsNote: vi.fn(),
  askNotebook: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ...api,
  getNotebook: vi.fn(() => Promise.resolve(notebook)),
  listNotebookMessages: vi.fn(() => Promise.resolve([])),
  getStudioCatalog: vi.fn(() => Promise.resolve(studioCatalog)),
  renameStudioArtifact: vi.fn(),
  studioExportUrl: (id: number, artifactId: number, format: string) =>
    `/api/notebooks/${id}/studio/${artifactId}/export.${format}`,
  updateNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
  summarizeNotebook: vi.fn(),
  updateNotebookSource: vi.fn(),
  selectAllNotebookSources: vi.fn(),
  deleteNotebookSource: vi.fn(),
  getNotebookSource: vi.fn(),
  clearNotebookMessages: vi.fn(),
  addNotebookNote: vi.fn(),
  updateNotebookNote: vi.fn(),
  deleteNotebookNote: vi.fn(),
  saveAnswerAsNote: vi.fn(),
  addNotebookText: vi.fn(),
  uploadNotebookSource: vi.fn(),
  addNotebookAppSource: vi.fn(),
  listMaterials: vi.fn(() => Promise.resolve([])),
  listStudies: vi.fn(() => Promise.resolve([])),
  // D-97: the search well in the sources panel reads what is switched on.
  getSourceCapabilities: vi.fn(() =>
    Promise.resolve({
      link: { enabled: true, reason: null },
      youtube: { enabled: true, reason: null },
      openalex: { enabled: false, reason: "Sem chave do OpenAlex." },
      wikipedia: { enabled: true, reason: null },
      web: { enabled: false, reason: "Busca na web desligada." },
    }),
  ),
  searchSources: vi.fn(),
  addExternalSource: vi.fn(),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listStudio.mockResolvedValue({ artifacts: [], usage: { used: 0, limit: 10, remaining: 10 } });
  api.getStudioArtifact.mockImplementation((_id: number, artifactId: number) =>
    Promise.resolve(artifactById(artifactId)),
  );
  api.createStudioArtifact.mockResolvedValue({ ...reportArtifact, status: "gerando" });
});

async function openTool(user: ReturnType<typeof userEvent.setup>, name: string) {
  const tile = await screen.findByRole("button", { name: new RegExp(name) });
  await waitFor(() => expect(tile).not.toHaveAttribute("aria-disabled"));
  await user.click(tile);
}

async function openArtifact(user: ReturnType<typeof userEvent.setup>, title: string) {
  api.listStudio.mockResolvedValue(studioList);
  render(wrap(<NotebookWorkspace id={4} />));
  await user.click(await screen.findByRole("button", { name: s.open(title) }));
  return screen.findByRole("heading", { name: title });
}

describe("Estúdio: criar", () => {
  it("the report's pencil opens the template's own instruction, and Gerar sends the edit", async () => {
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await openTool(user, t.studioTools.report);

    const dialog = await screen.findByRole("dialog", { name: s.createTitle.report });
    expect(within(dialog).getByRole("group", { name: s.format })).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: "Visão geral" })).toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: s.editTemplate("Guia de estudo") }));
    expect(within(dialog).getByRole("radio", { name: "Guia de estudo" })).toBeChecked();
    const box = within(dialog).getByRole("textbox", { name: s.templateInstructions });
    expect(box).toHaveValue("Escreva um guia de estudo para um aluno de graduação.");
    await user.clear(box);
    await user.type(box, "Para calouros.");
    await user.type(within(dialog).getByRole("textbox", { name: s.topic }), "aços");
    await user.click(within(dialog).getByRole("button", { name: s.generate }));

    await waitFor(() =>
      expect(api.createStudioArtifact).toHaveBeenCalledWith(4, {
        tool: "report",
        format: "corrido",
        template: "guia_estudo",
        instructions: "Para calouros.",
        topic: "aços",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("the custom report cannot be generated without the student's words", async () => {
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await openTool(user, t.studioTools.report);
    const dialog = await screen.findByRole("dialog", { name: s.createTitle.report });
    await user.click(within(dialog).getByRole("radio", { name: "Crie o seu" }));
    expect(within(dialog).getByRole("button", { name: s.generate })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: s.templateInstructions }), "Um resumo.");
    expect(within(dialog).getByRole("button", { name: s.generate })).toBeEnabled();
  });

  it("flashcards send their count and level, and never a template", async () => {
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await openTool(user, t.studioTools.flashcards);
    const dialog = await screen.findByRole("dialog", { name: s.createTitle.flashcards });
    expect(within(dialog).getByText("15 cartões")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Mais" }));
    await user.click(within(dialog).getByRole("button", { name: "Difícil" }));
    await user.click(within(dialog).getByRole("button", { name: s.generate }));
    await waitFor(() =>
      expect(api.createStudioArtifact).toHaveBeenCalledWith(4, {
        tool: "flashcards",
        format: "pergunta",
        count: "mais",
        difficulty: "dificil",
      }),
    );
  });

  it("the table's pencil edits the columns", async () => {
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await openTool(user, t.studioTools.table);
    const dialog = await screen.findByRole("dialog", { name: s.createTitle.table });
    await user.click(
      within(dialog).getByRole("button", { name: s.editTemplate("Propriedades de materiais") }),
    );
    await user.click(within(dialog).getByRole("button", { name: s.removeColumn("Propriedade") }));
    await user.click(within(dialog).getByRole("button", { name: s.addColumn }));
    await user.type(within(dialog).getByRole("textbox", { name: s.columnLabel(3) }), "Unidade");
    await user.click(within(dialog).getByRole("button", { name: s.generate }));
    await waitFor(() =>
      expect(api.createStudioArtifact).toHaveBeenCalledWith(4, {
        tool: "table",
        template: "propriedades",
        columns: ["Material", "Valor", "Unidade"],
      }),
    );
  });

  it("the API's refusal is shown in the dialog", async () => {
    api.createStudioArtifact.mockRejectedValue(new Error("Você usou as 10 gerações de hoje no Estúdio."));
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await openTool(user, t.studioTools.quiz);
    const dialog = await screen.findByRole("dialog", { name: s.createTitle.quiz });
    await user.click(within(dialog).getByRole("button", { name: s.generate }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("10 gerações de hoje");
  });
});

describe("Estúdio: lista", () => {
  it("says what is running, what failed and why, and makes a failed one again", async () => {
    api.listStudio.mockResolvedValue(studioList);
    api.createStudioArtifact.mockResolvedValue({ ...flashcardsArtifact, status: "gerando" });
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));

    expect(await screen.findByText(runningArtifact.title)).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(s.generatingHint)).length).toBeGreaterThan(0);
    expect(screen.getByText(failedArtifact.error!)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(s.usage(5, 10)))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: s.retry }));
    await waitFor(() =>
      expect(api.createStudioArtifact).toHaveBeenCalledWith(4, {
        tool: "flashcards",
        format: "pergunta",
        count: "menos",
        difficulty: "medio",
      }),
    );
    await waitFor(() => expect(api.deleteStudioArtifact).toHaveBeenCalledWith(4, failedArtifact.id));
  });
});

describe("Estúdio: ver", () => {
  it("a report opens in the panel, cited, with its exports behind one menu", async () => {
    const user = userEvent.setup();
    await openArtifact(user, reportArtifact.title);
    expect(screen.getByRole("heading", { name: "Aços carbono" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.citation(1, "Aula de aços") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: s.export }));
    const docx = await screen.findByRole("menuitem", { name: s.exportLabels.docx });
    expect(docx).toHaveAttribute("href", "/api/notebooks/4/studio/21/export.docx");
    // Back to the grid.
    await user.click(screen.getByRole("button", { name: s.backToStudio }));
    expect(await screen.findByRole("heading", { name: s.generated })).toBeInTheDocument();
  });

  it("a flashcard turns over, shows its source, and moves on", async () => {
    const user = userEvent.setup();
    await openArtifact(user, flashcardsArtifact.title);
    expect(screen.getByText(`${s.cardPosition(1, 2)} · ${s.frontFace}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: s.flip }));
    expect(screen.getByText(`${s.cardPosition(1, 2)} · ${s.backFace}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.citation(1, "Aula de aços") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: s.next }));
    expect(screen.getByText(`${s.cardPosition(2, 2)} · ${s.frontFace}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s.next })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: s.shuffle }));
    expect(screen.getByText(`${s.cardPosition(1, 2)} · ${s.frontFace}`)).toBeInTheDocument();
  });

  it("a quiz says which answer was right, in words, explains it and scores it", async () => {
    const user = userEvent.setup();
    await openArtifact(user, quizArtifact.title);
    // What the check left out is said, not hidden.
    expect(screen.getByText(/citava números que não aparecem/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: s.hint }));
    expect(screen.getByText("Veja a aula de aços.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /2700 kg\/m³/ }));
    expect(screen.getByText(s.wrong("a"))).toBeInTheDocument();
    expect(screen.getByText(s.rightAnswer)).toBeInTheDocument();
    expect(screen.getByText(s.yourAnswer)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: s.explain }));
    expect(screen.getByText("A fonte diz 7850 kg/m³.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: s.finish }));
    expect(screen.getByText(s.score(0, 1))).toHaveAttribute("role", "status");
  });

  it("a table cell without a value says why, never blank", async () => {
    const user = userEvent.setup();
    await openArtifact(user, tableArtifact.title);
    const table = screen.getByRole("table");
    expect(within(table).getByText(s.absent)).toBeInTheDocument();
    expect(within(table).getByText(s.withheldCell)).toBeInTheDocument();
    expect(within(table).getByText("Aço carbono")).toBeInTheDocument();
  });

  it("a mind map branch brings its question to the chat box without sending it", async () => {
    const user = userEvent.setup();
    await openArtifact(user, mindmapArtifact.title);
    // The drawing and its text alternative.
    expect(screen.getByRole("group", { name: s.mapLabel(mindmapArtifact.title) })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: s.viewList }));
    await user.click(screen.getByRole("button", { name: s.askAbout("Densidade") }));
    expect(screen.getByRole("textbox", { name: t.askLabel })).toHaveValue(s.askPrompt("Densidade"));
    expect(api.askNotebook).not.toHaveBeenCalled();
  });
});
