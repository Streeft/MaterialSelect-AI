import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotebookSource } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { SourceReader, webLink } from "./SourceReader";

const t = ptBR.notebooks;

vi.mock("@/lib/api", () => ({
  getNotebookSource: vi.fn((_notebookId: number, id: number) =>
    Promise.resolve({ ...base, id, content: "Texto inteiro da fonte." }),
  ),
}));

const base: NotebookSource = {
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

function renderReader(source: NotebookSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SourceReader notebookId={4} source={source} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

async function expectAccessible(container: Element) {
  const violations = await findA11yViolations(container);
  expect(violations, describeViolations(violations)).toHaveLength(0);
}

describe("webLink", () => {
  it("accepts only http and https", () => {
    expect(webLink("https://pt.wikipedia.org/wiki/A%C3%A7o")).toEqual({
      href: "https://pt.wikipedia.org/wiki/A%C3%A7o",
      host: "pt.wikipedia.org",
    });
    expect(webLink("http://exemplo.org/p")?.host).toBe("exemplo.org");
    expect(webLink("javascript:alert(1)")).toBeNull();
    expect(webLink("JavaScript:alert(1)")).toBeNull();
    expect(webLink("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(webLink("não é endereço")).toBeNull();
  });
});

describe("SourceReader (D-97)", () => {
  it("shows no origin block for a source that has none", async () => {
    renderReader(base);
    expect(await screen.findByText("Texto inteiro da fonte.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: t.reader.origin })).toBeNull();
  });

  it("links an https origin in a new tab, with its host visible", async () => {
    const { baseElement } = renderReader({
      ...base,
      kind: "wikipedia",
      title: "Aço",
      url: "https://pt.wikipedia.org/wiki/A%C3%A7o",
      license: "CC BY-SA 4.0",
      attribution: "Texto de “Aço”, da Wikipédia em português, por seus editores.",
      details: { revision_id: 123456 },
    });
    await screen.findByText("Texto inteiro da fonte.");
    expect(screen.getByRole("heading", { name: t.reader.origin })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /pt\.wikipedia\.org/ });
    expect(link).toHaveAttribute("href", "https://pt.wikipedia.org/wiki/A%C3%A7o");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveAccessibleName(`pt.wikipedia.org — ${t.reader.openOrigin("Aço")}`);
    expect(screen.getByText("CC BY-SA 4.0")).toBeInTheDocument();
    expect(
      screen.getByText("Texto de “Aço”, da Wikipédia em português, por seus editores."),
    ).toBeInTheDocument();
    expect(screen.getByText("123456")).toBeInTheDocument();
    await expectAccessible(baseElement);
  });

  it.each(["javascript:alert(1)", "data:text/html,<b>oi</b>"])(
    "never turns %s into a link",
    async (url) => {
      const { baseElement } = renderReader({ ...base, kind: "site", title: "Página", url });
      await screen.findByText("Texto inteiro da fonte.");
      expect(screen.queryByRole("link")).toBeNull();
      expect(baseElement.querySelector("a[href]")).toBeNull();
      expect(screen.getByText(url)).toBeInTheDocument();
    },
  );

  it("writes the licence's absence instead of leaving it blank", async () => {
    renderReader({ ...base, kind: "site", title: "Página", url: "https://exemplo.org/aco" });
    await screen.findByText("Texto inteiro da fonte.");
    expect(screen.getByText(t.reader.noLicense)).toBeInTheDocument();
  });

  it("says an article's missing authors and year in words", async () => {
    const { baseElement } = renderReader({
      ...base,
      kind: "artigo",
      title: "Fadiga em aços",
      url: "https://openalex.org/W123",
      license: "cc-by",
      details: { authors: [], year: 0 },
    });
    await screen.findByText("Texto inteiro da fonte.");
    expect(screen.getByText(t.search.noAuthors)).toBeInTheDocument();
    expect(screen.getByText(t.search.noYear)).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    await expectAccessible(baseElement);
  });

  it("shows an article's authors, year and venue when known", async () => {
    renderReader({
      ...base,
      kind: "artigo",
      title: "Fadiga em aços",
      url: "https://openalex.org/W123",
      details: { authors: ["Ana Souza", "Bruno Lima"], year: 2021, venue: "Revista de Materiais" },
    });
    await screen.findByText("Texto inteiro da fonte.");
    expect(screen.getByText("Ana Souza; Bruno Lima")).toBeInTheDocument();
    expect(screen.getByText("2021")).toBeInTheDocument();
    expect(screen.getByText("Revista de Materiais")).toBeInTheDocument();
    expect(screen.queryByText(t.search.noAuthors)).toBeNull();
  });

  it("says a video's transcript was pasted by the student", async () => {
    const { baseElement } = renderReader({
      ...base,
      kind: "youtube",
      title: "Aula sobre ligas",
      url: "https://www.youtube.com/watch?v=abc123DEF45",
      details: { channel: "Canal de Materiais", transcript_origin: "colada" },
    });
    await screen.findByText("Texto inteiro da fonte.");
    expect(screen.getByText("Transcrição colada pelo aluno")).toBeInTheDocument();
    expect(screen.getByText("Canal de Materiais")).toBeInTheDocument();
    await expectAccessible(baseElement);
  });
});
