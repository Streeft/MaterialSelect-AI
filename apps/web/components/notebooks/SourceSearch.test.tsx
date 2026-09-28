import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Notebook,
  NotebookSearch,
  NotebookSearchResult,
  NotebookSourceCapabilities,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { ApiError } from "@/lib/api";
import { SourceSearch, suggestionsDocument } from "./SourceSearch";
import { SourcesPanel } from "./SourcesPanel";
import { notebookKey } from "./keys";

const t = ptBR.notebooks;
const s = t.search;

const api = vi.hoisted(() => ({
  searchSources: vi.fn(),
  addExternalSource: vi.fn(),
  getSourceCapabilities: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ApiError: actual.ApiError,
    ...api,
    updateNotebookSource: vi.fn(),
    selectAllNotebookSources: vi.fn(),
    deleteNotebookSource: vi.fn(),
    getNotebookSource: vi.fn(),
    addNotebookAppSource: vi.fn(),
    addNotebookText: vi.fn(),
    addUrlSource: vi.fn(),
    addYoutubeSource: vi.fn(),
    listMaterials: vi.fn(() => Promise.resolve([])),
    listStudies: vi.fn(() => Promise.resolve([])),
    uploadNotebookSource: vi.fn(),
  };
});

const on = { enabled: true, reason: null };
function capabilities(overrides: Partial<NotebookSourceCapabilities> = {}): NotebookSourceCapabilities {
  return { link: on, youtube: on, openalex: on, wikipedia: on, web: on, ...overrides };
}

const notebook: Notebook = {
  id: 4,
  title: "Aços",
  emoji: "📘",
  created_at: "2026-09-25T10:00:00Z",
  updated_at: "2026-09-25T10:00:00Z",
  chat_goal: "padrao",
  chat_instructions: null,
  response_length: "padrao",
  summary: null,
  suggested_questions: [],
  sources: [],
  notes: [],
  usage: { used: 0, limit: 60, remaining: 60 },
  fetch_usage: { used: 3, limit: 30, remaining: 27 },
  max_sources: 50,
  ai_enabled: true,
  ai_simulated: false,
  ai_notice: "Não envie material sigiloso ou dados pessoais.",
} as Notebook;

function work(overrides: Partial<NotebookSearchResult> = {}): NotebookSearchResult {
  return {
    provider: "openalex",
    key: "W1",
    title: "Fadiga em ligas de alumínio",
    subtitle: "Ana Souza · 2021 · Revista de Materiais",
    snippet: "Estudamos a fadiga de ligas 6061.",
    url: "https://openalex.org/W1",
    license: "cc-by",
    has_text: true,
    already_added: false,
    ...overrides,
  };
}

function answer(results: NotebookSearchResult[], extra: Partial<NotebookSearch> = {}): NotebookSearch {
  return { results, notice: null, search_entry_point_html: null, ...extra };
}

let client: QueryClient;
function wrap(node: ReactNode) {
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.getSourceCapabilities.mockResolvedValue(capabilities());
});

const queryField = () => screen.getByLabelText(s.queryLabel);
const submitButton = () => screen.getByRole("button", { name: s.submit });

async function searchFor(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(queryField(), text);
  await user.click(submitButton());
}

describe("SourceSearch — searching", () => {
  it("searches the chosen provider and lists what it found", async () => {
    api.searchSources.mockResolvedValue(
      answer([work(), work({ key: "W2", title: "Ligas leves", url: "https://openalex.org/W2" })]),
    );
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await searchFor(user, "fadiga");
    await screen.findByText(s.resultsCount(2));
    expect(api.searchSources).toHaveBeenCalledWith(4, { provider: "openalex", query: "fadiga" });

    const list = screen.getByRole("list", { name: s.results });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText("Ana Souza · 2021 · Revista de Materiais")).toHaveLength(2);
    expect(screen.getAllByText("Estudamos a fadiga de ligas 6061.")).toHaveLength(2);
    const link = screen.getAllByRole("link")[0]!;
    expect(link).toHaveAttribute("href", "https://openalex.org/W1");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveTextContent("openalex.org");
  });

  it("picks Wikipédia and sends its provider", async () => {
    api.searchSources.mockResolvedValue(answer([]));
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await user.click(screen.getByRole("button", { name: s.providers.wikipedia }));
    expect(screen.getByRole("button", { name: s.providers.wikipedia })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await searchFor(user, "aço");
    await waitFor(() =>
      expect(api.searchSources).toHaveBeenCalledWith(4, { provider: "wikipedia", query: "aço" }),
    );
  });

  it("says in words when nothing was found", async () => {
    api.searchSources.mockResolvedValue(answer([]));
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await searchFor(user, "xyzzy");
    expect(await screen.findByText(s.empty("xyzzy"))).toBeInTheDocument();
  });

  it("shows the server's message when the search is refused", async () => {
    const message = "Limite diário de buscas atingido: 30 por dia.";
    api.searchSources.mockRejectedValue(new ApiError(message, 429));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await searchFor(user, "fadiga");
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    // A refused search may still have counted; the counter is refreshed.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notebookKey(4) });
  });

  it("shows today's count of outside requests", () => {
    render(wrap(<SourceSearch notebook={notebook} />));
    expect(screen.getByText(s.usage(3, 30))).toBeInTheDocument();
  });

  it("uses a secondary search button, never a second primary", () => {
    render(wrap(<SourceSearch notebook={notebook} />));
    expect(document.querySelectorAll(".msds-btn-primary")).toHaveLength(0);
    expect(submitButton()).toHaveClass("msds-btn-secondary");
  });
});

describe("SourceSearch — results", () => {
  it("a result without text is shown, not selectable, with its open link", async () => {
    api.searchSources.mockResolvedValue(
      answer([
        work({
          key: "W9",
          title: "Sem resumo",
          snippet: null,
          has_text: false,
          url: "https://repositorio.exemplo.org/w9.pdf",
        }),
      ]),
    );
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await searchFor(user, "fadiga");
    const box = await screen.findByRole("checkbox", { name: s.select("Sem resumo") });
    expect(box).toBeDisabled();
    expect(screen.getByText(s.noText)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /repositorio\.exemplo\.org/ })).toHaveAttribute(
      "href",
      "https://repositorio.exemplo.org/w9.pdf",
    );
    expect(screen.queryByRole("button", { name: /Adicionar \d/ })).toBeNull();
  });

  it("a result already in the notebook says so and cannot be ticked", async () => {
    api.searchSources.mockResolvedValue(answer([work({ already_added: true })]));
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await searchFor(user, "fadiga");
    const box = await screen.findByRole("checkbox", {
      name: s.select("Fadiga em ligas de alumínio"),
    });
    expect(box).toBeDisabled();
    expect(screen.getByText(s.alreadyAdded)).toBeInTheDocument();
  });

  it("writes out absent title, subtitle, snippet and licence", async () => {
    api.searchSources.mockResolvedValue(
      answer([work({ title: "  ", subtitle: null, snippet: null, license: null })]),
    );
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await searchFor(user, "fadiga");
    expect(await screen.findByRole("checkbox", { name: s.select(s.noTitle) })).toBeEnabled();
    expect(
      screen.getByText(`${s.noAuthors} · ${s.noYear} · ${t.reader.noVenue}`),
    ).toBeInTheDocument();
    expect(screen.getByText(s.noSnippet)).toBeInTheDocument();
    expect(screen.getByText(t.reader.noLicense)).toBeInTheDocument();
  });

  it("never links an address that is not http(s)", async () => {
    api.searchSources.mockResolvedValue(answer([work({ url: "javascript:alert(1)" })]));
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await searchFor(user, "fadiga");
    expect(await screen.findByText("javascript:alert(1)")).toBeInTheDocument();
    expect(document.querySelector("a[href]")).toBeNull();
  });
});

describe("SourceSearch — adding", () => {
  it("adds the ticked results one at a time, each with its status", async () => {
    api.searchSources.mockResolvedValue(
      answer([
        work({ key: "W1", title: "Primeiro" }),
        work({ key: "W2", title: "Segundo" }),
        work({ key: "W3", title: "Terceiro" }),
      ]),
    );
    const message = "Este artigo já está no caderno.";
    let release: () => void = () => {};
    api.addExternalSource
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ id: 1 });
          }),
      )
      .mockRejectedValueOnce(new ApiError(message, 409));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await searchFor(user, "fadiga");
    await user.click(await screen.findByRole("checkbox", { name: s.select("Primeiro") }));
    await user.click(screen.getByRole("checkbox", { name: s.select("Terceiro") }));
    await user.click(screen.getByRole("button", { name: s.add(2) }));

    // The first is in flight; the second has not started.
    const list = screen.getByRole("list", { name: s.results });
    expect(await within(list).findByText(s.itemStatus.adding!)).toBeInTheDocument();
    expect(api.addExternalSource).toHaveBeenCalledTimes(1);
    expect(api.addExternalSource).toHaveBeenCalledWith(4, { provider: "openalex", key: "W1" });

    release();
    expect(await screen.findByText(`${s.itemStatus.failed}: ${message}`)).toBeInTheDocument();
    expect(api.addExternalSource).toHaveBeenCalledTimes(2);
    expect(api.addExternalSource).toHaveBeenLastCalledWith(4, { provider: "openalex", key: "W3" });
    expect(screen.getByText(s.itemStatus.added!)).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notebookKey(4) });

    // Added is no longer selectable; the failed one can be tried again.
    expect(screen.getByRole("checkbox", { name: s.select("Primeiro") })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: s.select("Terceiro") })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: s.select("Segundo") })).not.toBeChecked();
    expect(api.addExternalSource).not.toHaveBeenCalledWith(4, { provider: "openalex", key: "W2" });
  });
});

describe("SourceSearch — capabilities", () => {
  it("starts on the first provider that is on", async () => {
    api.getSourceCapabilities.mockResolvedValue(
      capabilities({ openalex: { enabled: false, reason: "Sem chave do OpenAlex." } }),
    );
    render(wrap(<SourceSearch notebook={notebook} />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: s.providers.wikipedia })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("a provider that is off stays focusable and says why", async () => {
    const reason = "A busca de artigos precisa de uma chave do OpenAlex, que não está configurada.";
    api.getSourceCapabilities.mockResolvedValue(
      capabilities({ openalex: { enabled: false, reason } }),
    );
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    const item = screen.getByRole("button", { name: s.providers.openalex });
    await waitFor(() => expect(item).toHaveAttribute("aria-disabled", "true"));
    expect(item).not.toBeDisabled();
    expect(item).toHaveAccessibleDescription(reason);
    item.focus();
    expect(item).toHaveFocus();

    await user.click(item);
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(item).toHaveAccessibleDescription(
      `${s.providerOff(s.providers.openalex!)} ${reason}`,
    );
    await user.type(queryField(), "fadiga");
    expect(submitButton()).toHaveAttribute("aria-disabled", "true");
    expect(submitButton()).toHaveAccessibleDescription(
      `${s.providerOff(s.providers.openalex!)} ${reason}`,
    );
    await user.click(submitButton());
    expect(api.searchSources).not.toHaveBeenCalled();
  });
});

describe("SourceSearch — web", () => {
  const suggestions =
    '<style>.chip{color:red}</style><div class="container"><a class="chip" href="https://www.google.com/search?q=a%C3%A7o">aço</a></div>';

  it("shows the privacy notice and Google's suggestions only in a sandboxed frame", async () => {
    api.searchSources.mockResolvedValue(
      answer(
        [
          work({
            provider: "web",
            key: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
            title: "exemplo.org",
            subtitle: null,
            snippet: null,
            url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
            license: null,
          }),
        ],
        { notice: "Os links vêm da busca do Google.", search_entry_point_html: suggestions },
      ),
    );
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    await user.click(screen.getByRole("button", { name: s.providers.web }));
    expect(screen.getByText(s.webPrivacy)).toBeInTheDocument();
    await searchFor(user, "aço");
    expect(await screen.findByText("Os links vêm da busca do Google.")).toBeInTheDocument();

    const frame = screen.getByTitle(s.suggestionsLabel);
    expect(frame.tagName).toBe("IFRAME");
    const sandbox = frame.getAttribute("sandbox");
    expect(sandbox).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(sandbox).not.toMatch(/allow-scripts|allow-same-origin|allow-top-navigation/);
    expect(frame.getAttribute("srcdoc")).toBe(suggestionsDocument(suggestions));
    // Google's markup never reaches this document.
    expect(document.querySelector("a.chip")).toBeNull();
    expect(document.querySelector("div.container")).toBeNull();
    expect(screen.getByRole("link", { name: new RegExp(s.searchLink) })).toBeInTheDocument();
  });

  it("wraps the suggestions with a new-tab base and a no-script policy", () => {
    const doc = suggestionsDocument("<p>x</p>");
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toContain("script-src");
    expect(doc).toContain("<p>x</p>");
  });

  it("has no frame when there are no suggestions, and no notice off web", async () => {
    api.searchSources.mockResolvedValue(answer([work()]));
    const user = userEvent.setup();
    render(wrap(<SourceSearch notebook={notebook} />));
    expect(screen.queryByText(s.webPrivacy)).toBeNull();
    await searchFor(user, "fadiga");
    await screen.findByText(s.resultsCount(1));
    expect(document.querySelector("iframe")).toBeNull();
  });
});

describe("SourceSearch — accessibility", () => {
  it("the sources panel has no axe violations before and after a search", async () => {
    api.getSourceCapabilities.mockResolvedValue(
      capabilities({ openalex: { enabled: false, reason: "Sem chave do OpenAlex." } }),
    );
    api.searchSources.mockResolvedValue(
      answer(
        [
          work({ provider: "wikipedia", key: "1", title: "Aço", subtitle: "Wikipédia em português" }),
          work({ provider: "wikipedia", key: "2", title: "Aço inox", already_added: true }),
          work({ provider: "wikipedia", key: "3", title: "Ferro", has_text: false, snippet: null }),
        ],
        { search_entry_point_html: "<div>sugestões</div>" },
      ),
    );
    const user = userEvent.setup();
    const { container } = render(wrap(<SourcesPanel notebook={notebook} expanded />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: s.providers.openalex })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    let violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);

    await searchFor(user, "aço");
    await screen.findByText(s.resultsCount(3));
    await user.click(screen.getByRole("checkbox", { name: s.select("Aço") }));
    // jsdom cannot enter a srcdoc frame; the frame element itself (its title)
    // is still audited from here.
    violations = await findA11yViolations(container, { iframes: false });
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
