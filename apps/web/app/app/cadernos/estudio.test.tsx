import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Notebook } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { RasterizeError } from "@/lib/rasterize";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { NotebookWorkspace } from "@/components/notebooks/NotebookWorkspace";
import {
  artifactById,
  audioArtifact,
  failedArtifact,
  flashcardsArtifact,
  infographicArtifact,
  mindmapArtifact,
  quizArtifact,
  reportArtifact,
  runningArtifact,
  slidesArtifact,
  studioCatalog,
  studioList,
  tableArtifact,
  videoArtifact,
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

// D-98: the PNG is made in the browser; here only the call and its failure matter.
const raster = vi.hoisted(() => ({ svgToPngDownload: vi.fn() }));
vi.mock("@/lib/rasterize", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rasterize")>()),
  svgToPngDownload: raster.svgToPngDownload,
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
  raster.svgToPngDownload.mockResolvedValue(undefined);
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

  it("every tool's tile is live, none says it is coming (D-98)", async () => {
    render(wrap(<NotebookWorkspace id={4} />));
    for (const label of Object.values(t.studioTools)) {
      const tile = await screen.findByRole("button", { name: new RegExp(label) });
      await waitFor(() => expect(tile).not.toHaveAttribute("aria-disabled"));
    }
  });

  it("the audio's templates read as Formato, and the pencil's edit, template and length are sent", async () => {
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await openTool(user, t.studioTools.audio);
    const dialog = await screen.findByRole("dialog", { name: s.createTitle.audio });
    expect(within(dialog).getByRole("group", { name: s.templateLegend.audio })).toBeInTheDocument();
    expect(within(dialog).queryByRole("group", { name: s.template })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: "Conversa aprofundada" })).toBeChecked();
    expect(within(dialog).getByText("Cerca de 24 falas")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: s.editTemplate("Debate") }));
    expect(within(dialog).getByRole("radio", { name: "Debate" })).toBeChecked();
    const box = within(dialog).getByRole("textbox", { name: s.templateInstructions });
    expect(box).toHaveValue("Escreva um debate entre dois pontos de vista.");
    await user.clear(box);
    await user.type(box, "Um lado defende o alumínio.");
    await user.click(within(dialog).getByRole("button", { name: "Longo" }));
    await user.click(within(dialog).getByRole("button", { name: s.generate }));

    await waitFor(() =>
      expect(api.createStudioArtifact).toHaveBeenCalledWith(4, {
        tool: "audio",
        template: "debate",
        instructions: "Um lado defende o alumínio.",
        count: "longo",
      }),
    );
  });

  it("an unedited template sends no instructions: the API reads its own text", async () => {
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await openTool(user, t.studioTools.slides);
    const dialog = await screen.findByRole("dialog", { name: s.createTitle.slides });
    expect(within(dialog).getByRole("group", { name: s.template })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Resumo para o apresentador" }));
    await user.click(within(dialog).getByRole("button", { name: "Mais" }));
    await user.click(within(dialog).getByRole("button", { name: s.generate }));
    await waitFor(() =>
      expect(api.createStudioArtifact).toHaveBeenCalledWith(4, {
        tool: "slides",
        template: "apresentador",
        count: "mais",
      }),
    );
  });

  it("the infographic's formats read as Orientação; the video's length is its format", async () => {
    const user = userEvent.setup();
    render(wrap(<NotebookWorkspace id={4} />));
    await openTool(user, t.studioTools.infographic);
    let dialog = await screen.findByRole("dialog", { name: s.createTitle.infographic });
    expect(within(dialog).getByRole("group", { name: s.formatLegend.infographic })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Retrato" }));
    await user.click(within(dialog).getByRole("button", { name: "Conciso" }));
    await user.click(within(dialog).getByRole("button", { name: s.generate }));
    await waitFor(() =>
      expect(api.createStudioArtifact).toHaveBeenCalledWith(4, {
        tool: "infographic",
        format: "retrato",
        count: "conciso",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await openTool(user, t.studioTools.video);
    dialog = await screen.findByRole("dialog", { name: s.createTitle.video });
    await user.click(within(dialog).getByRole("radio", { name: "Resumo" }));
    await user.click(within(dialog).getByRole("button", { name: s.generate }));
    await waitFor(() =>
      expect(api.createStudioArtifact).toHaveBeenLastCalledWith(4, { tool: "video", format: "resumo" }),
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

describe("Estúdio: áudio, vídeo, slides e infográfico (D-98)", () => {
  const originalPrint = window.print;
  afterEach(() => {
    window.print = originalPrint;
  });

  async function expectAccessible(container: Element) {
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  }

  it("the audio opens as a transcript, says what was withheld once, and exports the script", async () => {
    const user = userEvent.setup();
    await openArtifact(user, audioArtifact.title);
    const transcript = screen.getByRole("region", { name: s.transcript });
    expect(within(transcript).getAllByRole("listitem")).toHaveLength(2);
    expect(within(transcript).getByText(s.speaker(2))).toBeInTheDocument();
    // The generic Alert is the audio's only one.
    expect(screen.getAllByText(audioArtifact.withheld[0]!)).toHaveLength(1);
    expect(screen.getByText(s.withheldTitle)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: s.export }));
    expect(await screen.findByRole("menuitem", { name: s.exportLabelsByTool.audio!.docx! })).toHaveAttribute(
      "href",
      "/api/notebooks/4/studio/28/export.docx",
    );
    expect(screen.getByRole("menuitem", { name: s.exportLabels.txt })).toHaveAttribute(
      "href",
      "/api/notebooks/4/studio/28/export.txt",
    );
    expect(screen.queryByRole("menuitem", { name: s.exportPng })).not.toBeInTheDocument();
  });

  it("the video opens on its first scene, with the slide and the caption", async () => {
    const user = userEvent.setup();
    await openArtifact(user, videoArtifact.title);
    expect(screen.getByText(s.scenePosition(1, 2))).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aço carbono" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: s.export }));
    expect(await screen.findByRole("menuitem", { name: s.exportLabels.pptx })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: s.exportPdf })).not.toBeInTheDocument();
  });

  it("the slides say what was withheld once, and PDF (imprimir) prints the deck", async () => {
    window.print = vi.fn();
    const user = userEvent.setup();
    await openArtifact(user, slidesArtifact.title);
    expect(screen.getByRole("region", { name: s.deckLabel(slidesArtifact.title) })).toBeInTheDocument();
    expect(screen.getByText(s.slidePosition(1, 2))).toBeInTheDocument();
    expect(screen.getAllByText(slidesArtifact.withheld[0]!)).toHaveLength(1);
    expect(window.print).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: s.export }));
    expect(await screen.findByRole("menuitem", { name: s.exportLabels.pptx })).toHaveAttribute(
      "href",
      "/api/notebooks/4/studio/30/export.pptx",
    );
    await user.click(screen.getByRole("menuitem", { name: s.exportPdf }));
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
    expect(document.body.querySelector(".deck-print")).not.toBeNull();
    window.dispatchEvent(new Event("afterprint"));
    await waitFor(() => expect(document.body.querySelector(".deck-print")).toBeNull());

    // A second request prints again.
    await user.click(screen.getByRole("button", { name: s.export }));
    await user.click(await screen.findByRole("menuitem", { name: s.exportPdf }));
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(2));
  });

  it("the infographic is drawn, says what was withheld once, and saves a PNG from its SVG", async () => {
    const user = userEvent.setup();
    await openArtifact(user, infographicArtifact.title);
    expect(
      screen.getByRole("img", { name: s.infographicLabel(infographicArtifact.title) }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(infographicArtifact.withheld[0]!)).toHaveLength(1);
    expect(screen.getByText(s.infographicWithheldTitle)).toBeInTheDocument();
    expect(screen.queryByText(s.withheldTitle)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: s.export }));
    expect(await screen.findByRole("menuitem", { name: s.exportLabels.svg })).toHaveAttribute(
      "href",
      "/api/notebooks/4/studio/31/export.svg",
    );
    await user.click(screen.getByRole("menuitem", { name: s.exportPng }));
    await waitFor(() =>
      expect(raster.svgToPngDownload).toHaveBeenCalledWith(
        "/api/notebooks/4/studio/31/export.svg",
        "infografico-acos.png",
      ),
    );
    expect(screen.queryByText(s.pngFailed)).not.toBeInTheDocument();
  });

  it("a PNG the browser cannot make says to download the SVG", async () => {
    raster.svgToPngDownload.mockRejectedValue(new RasterizeError("tainted", "SecurityError"));
    const user = userEvent.setup();
    await openArtifact(user, mindmapArtifact.title);
    await user.click(screen.getByRole("button", { name: s.export }));
    await user.click(await screen.findByRole("menuitem", { name: s.exportPng }));
    expect(await screen.findByRole("alert")).toHaveTextContent(s.pngFailed);
    expect(raster.svgToPngDownload).toHaveBeenCalledWith(
      "/api/notebooks/4/studio/25/export.svg",
      "mapa-acos.png",
    );
  });

  it.each([
    ["áudio", audioArtifact.title],
    ["vídeo", videoArtifact.title],
    ["slides", slidesArtifact.title],
    ["infográfico", infographicArtifact.title],
  ])("the %s viewer passes axe", async (_what, title) => {
    const user = userEvent.setup();
    api.listStudio.mockResolvedValue(studioList);
    const { container } = render(wrap(<NotebookWorkspace id={4} />));
    await user.click(await screen.findByRole("button", { name: s.open(title) }));
    await screen.findByRole("heading", { name: title });
    await expectAccessible(container);
  });
});
