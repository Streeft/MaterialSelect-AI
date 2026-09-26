import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotebookSource, NotebookSourceCapabilities } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { ApiError } from "@/lib/api";
import { LinkTab, looksLikeYoutube } from "./LinkTab";
import { AddSourcesDialog } from "./AddSourcesDialog";
import { notebookKey } from "./keys";

const t = ptBR.notebooks;

const api = vi.hoisted(() => ({
  addUrlSource: vi.fn(),
  addYoutubeSource: vi.fn(),
  getSourceCapabilities: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ApiError: actual.ApiError,
    ...api,
    addNotebookAppSource: vi.fn(),
    addNotebookText: vi.fn(),
    listMaterials: vi.fn(() => Promise.resolve([])),
    listStudies: vi.fn(() => Promise.resolve([])),
    uploadNotebookSource: vi.fn(),
  };
});

const on = { enabled: true, reason: null };
function capabilities(overrides: Partial<NotebookSourceCapabilities> = {}): NotebookSourceCapabilities {
  return { link: on, youtube: on, openalex: on, wikipedia: on, web: on, ...overrides };
}

const source: NotebookSource = {
  id: 21,
  kind: "site",
  title: "Aços inoxidáveis",
  origin: "https://exemplo.org/acos",
  status: "pronto",
  error: null,
  char_count: 900,
  page_count: null,
  selected: true,
  truncated: false,
  created_at: "2026-09-26T10:00:00Z",
} as NotebookSource;

let client: QueryClient;
function wrap(node: ReactNode) {
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.getSourceCapabilities.mockResolvedValue(capabilities());
});

const urlField = () => screen.getByLabelText(new RegExp(t.link.urlLabel));

describe("looksLikeYoutube", () => {
  it("recognises the usual video addresses and nothing else", () => {
    expect(looksLikeYoutube("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(looksLikeYoutube("youtu.be/abc")).toBe(true);
    expect(looksLikeYoutube("https://m.youtube.com/shorts/abc")).toBe(true);
    expect(looksLikeYoutube("https://exemplo.org/youtube.com")).toBe(false);
    expect(looksLikeYoutube("https://notyoutube.com/watch?v=abc")).toBe(false);
    expect(looksLikeYoutube("")).toBe(false);
  });
});

describe("LinkTab — site", () => {
  it("adds a page, refreshes the notebook and closes", async () => {
    api.addUrlSource.mockResolvedValue(source);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(wrap(<LinkTab notebookId={4} onDone={onDone} />));
    await user.type(urlField(), "https://exemplo.org/acos");
    await user.click(screen.getByRole("button", { name: t.link.addSite }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.addUrlSource).toHaveBeenCalledWith(4, "https://exemplo.org/acos");
    expect(api.addYoutubeSource).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notebookKey(4) });
    expect(urlField()).toHaveValue("");
  });

  it("shows the server's reason when the address is refused", async () => {
    const message = "Endereços da rede interna não podem ser lidos.";
    api.addUrlSource.mockRejectedValue(new ApiError(message, 400));
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(wrap(<LinkTab notebookId={4} onDone={onDone} />));
    await user.type(urlField(), "http://10.0.0.1/");
    await user.click(screen.getByRole("button", { name: t.link.addSite }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("has exactly one primary button, which is the add button", async () => {
    render(wrap(<LinkTab notebookId={4} onDone={vi.fn()} />));
    const primaries = document.querySelectorAll(".msds-btn-primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent(t.link.addSite);
  });
});

describe("LinkTab — YouTube", () => {
  it("switches to the transcript form when the address is a video", async () => {
    const user = userEvent.setup();
    render(wrap(<LinkTab notebookId={4} onDone={vi.fn()} />));
    expect(screen.queryByLabelText(new RegExp(t.link.transcriptLabel))).toBeNull();
    await user.type(urlField(), "https://youtu.be/dQw4w9WgXcQ");
    const transcript = screen.getByLabelText(new RegExp(t.link.transcriptLabel));
    expect(transcript).toBeRequired();
    expect(screen.getByText(t.link.transcriptHint)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.link.addVideo })).toBeInTheDocument();
    expect(document.querySelectorAll(".msds-btn-primary")).toHaveLength(1);
  });

  it("without a transcript, shows the reason, keeps the title and focuses the field", async () => {
    const reason = "O YouTube não deixa o servidor buscar a transcrição: cole-a abaixo.";
    api.addYoutubeSource.mockResolvedValueOnce({
      source: null,
      needs_transcript: true,
      video_title: "Ensaio de tração",
      reason,
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(wrap(<LinkTab notebookId={4} onDone={onDone} />));
    await user.type(urlField(), "https://www.youtube.com/watch?v=abc123");
    await user.click(screen.getByRole("button", { name: t.link.addVideo }));

    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.getByText(t.link.videoTitle("Ensaio de tração"))).toBeInTheDocument();
    const transcript = screen.getByLabelText(new RegExp(t.link.transcriptLabel));
    await waitFor(() => expect(transcript).toHaveFocus());
    expect(onDone).not.toHaveBeenCalled();
    expect(api.addYoutubeSource).toHaveBeenCalledWith(4, {
      url: "https://www.youtube.com/watch?v=abc123",
      transcript: "",
    });

    // Pasting and sending again adds the video; the title stayed meanwhile.
    api.addYoutubeSource.mockResolvedValueOnce({
      source: { ...source, kind: "youtube", title: "Ensaio de tração" },
      needs_transcript: false,
      video_title: "Ensaio de tração",
      reason: null,
    });
    await user.type(transcript, "Hoje vamos falar de ensaio de tração.");
    expect(screen.getByText(t.link.videoTitle("Ensaio de tração"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.link.addVideo }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.addYoutubeSource).toHaveBeenLastCalledWith(4, {
      url: "https://www.youtube.com/watch?v=abc123",
      transcript: "Hoje vamos falar de ensaio de tração.",
    });
  });
});

describe("LinkTab — capabilities", () => {
  it("a switched-off path keeps the button focusable and says why", async () => {
    const reason = "A leitura de links está desligada neste servidor.";
    api.getSourceCapabilities.mockResolvedValue(
      capabilities({ link: { enabled: false, reason } }),
    );
    const user = userEvent.setup();
    render(wrap(<LinkTab notebookId={4} onDone={vi.fn()} />));
    await user.type(urlField(), "https://exemplo.org/acos");
    expect(await screen.findByText(reason)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: t.link.addSite });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
    expect(button).toHaveAccessibleDescription(reason);
    await user.click(button);
    expect(api.addUrlSource).not.toHaveBeenCalled();
  });

  it("with every path off, the field itself carries the reason", async () => {
    const reason = "Fontes externas estão desligadas neste servidor.";
    api.getSourceCapabilities.mockResolvedValue(
      capabilities({ link: { enabled: false, reason }, youtube: { enabled: false, reason } }),
    );
    render(wrap(<LinkTab notebookId={4} onDone={vi.fn()} />));
    await waitFor(() => expect(urlField()).toHaveAttribute("aria-disabled", "true"));
    expect(urlField()).toHaveAccessibleDescription(reason);
    expect(urlField()).toHaveAttribute("readonly");
  });
});

describe("LinkTab — accessibility", () => {
  it("has no axe violations in site and YouTube modes", async () => {
    api.addYoutubeSource.mockResolvedValue({
      source: null,
      needs_transcript: true,
      video_title: "Ensaio de tração",
      reason: "Cole a transcrição.",
    });
    const user = userEvent.setup();
    const { container } = render(wrap(<LinkTab notebookId={4} onDone={vi.fn()} />));
    let violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
    await user.type(urlField(), "https://youtu.be/abc");
    await user.click(screen.getByRole("button", { name: t.link.addVideo }));
    await screen.findByText("Cole a transcrição.");
    violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("AddSourcesDialog", () => {
  it("offers the Link tab between pasted text and this app", async () => {
    const user = userEvent.setup();
    render(wrap(<AddSourcesDialog notebookId={4} open onClose={vi.fn()} />));
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual([t.tabUpload, t.tabText, t.link.tab, t.tabApp]);
    await user.click(screen.getByRole("tab", { name: t.link.tab }));
    expect(await screen.findByRole("button", { name: t.link.addSite })).toBeInTheDocument();
    expect(api.getSourceCapabilities).toHaveBeenCalled();
  });
});
