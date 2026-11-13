import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotebookSource } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { SourceReader } from "./SourceReader";

const t = ptBR.notebooks;

// The first sentence is repeated: the word search finds the first one, the position the cited one.
const CONTENT =
  "O aço é uma liga. Intermédio com outro assunto.\n\nO aço é uma liga. Esta é a que foi citada, com a sua continuação.";
const SECOND_START = CONTENT.lastIndexOf("O aço é uma liga.");
const SECOND_END = CONTENT.length;

vi.mock("@/lib/api", () => ({
  getNotebookSource: vi.fn((_notebookId: number, id: number) =>
    Promise.resolve({ ...base, id, content: CONTENT }),
  ),
}));

const base: NotebookSource = {
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

function renderReader(props: { excerpt?: string | null; position?: { start: number; end: number } | null }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SourceReader notebookId={4} source={base} onClose={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

describe("SourceReader: o trecho pela posição (D-233)", () => {
  it("marca o intervalo que o servidor guardou, não a primeira ocorrência das palavras", async () => {
    renderReader({
      excerpt: "O aço é uma liga.",
      position: { start: SECOND_START, end: SECOND_END },
    });
    const mark = await screen.findByText(/Esta é a que foi citada/, { selector: "mark" });
    expect(mark.textContent).toBe(CONTENT.slice(SECOND_START, SECOND_END));
    // Nothing of the first paragraph is marked.
    expect(document.querySelectorAll("mark")).toHaveLength(1);
  });

  it("marca só pela posição, sem o texto do trecho (o link recarregado)", async () => {
    renderReader({ excerpt: null, position: { start: 0, end: 17 } });
    const mark = await screen.findByText("O aço é uma liga.", { selector: "mark" });
    expect(mark.textContent).toBe(CONTENT.slice(0, 17));
    expect(screen.queryByText(t.reader.passageNotFound)).toBeNull();
  });

  it("sem posição, volta à busca por palavras (a primeira ocorrência)", async () => {
    renderReader({ excerpt: "O aço é uma liga. Intermédio com outro assunto.", position: null });
    const mark = await screen.findByText(/Intermédio/, { selector: "mark" });
    expect(mark.textContent).toBe("O aço é uma liga. Intermédio com outro assunto.");
  });

  it.each([
    ["além do texto", { start: 10, end: 99999 }],
    ["invertida", { start: 30, end: 5 }],
    ["vazia", { start: 4, end: 4 }],
    ["negativa", { start: -3, end: 8 }],
    ["fracionária", { start: 1.5, end: 8 }],
  ])("uma posição %s é ignorada e o leitor procura pelas palavras", async (_name, position) => {
    renderReader({ excerpt: "Esta é a que foi citada, com a sua continuação.", position });
    const mark = await screen.findByText(/Esta é a que foi citada/, { selector: "mark" });
    expect(mark.textContent).toBe("Esta é a que foi citada, com a sua continuação.");
  });

  it("sem posição e sem achar as palavras, diz que não achou e mostra o trecho", async () => {
    renderReader({ excerpt: "frase que não existe na fonte", position: null });
    expect(await screen.findByText(t.reader.passageNotFound)).toBeInTheDocument();
    expect(screen.getByText("frase que não existe na fonte")).toBeInTheDocument();
    expect(document.querySelector("mark")).toBeNull();
  });

  it("sem trecho nenhum, abre a fonte do começo, sem marca", async () => {
    renderReader({});
    await screen.findByText(/Intermédio/);
    expect(document.querySelector("mark")).toBeNull();
  });

  it("com a marca por posição não tem violações de acessibilidade", async () => {
    const { baseElement } = renderReader({ position: { start: SECOND_START, end: SECOND_END } });
    await screen.findByText(/Esta é a que foi citada/, { selector: "mark" });
    const violations = await findA11yViolations(baseElement, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false }, "heading-order": { enabled: false } },
    });
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
