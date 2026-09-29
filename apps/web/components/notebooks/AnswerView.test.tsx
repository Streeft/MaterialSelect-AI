import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotebookAnswer, NotebookCitation } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { AnswerView } from "./AnswerView";

const t = ptBR.notebooks;

const WIKI_CREDIT =
  "Texto de “Aço”, da Wikipédia em português (https://pt.wikipedia.org/wiki/A%C3%A7o), " +
  "escrito por colaboradores da Wikipédia e publicado sob a licença CC BY-SA 4.0 " +
  "(https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br); revisão 123, obtido em " +
  "28/09/2026. Texto sem modificações de conteúdo: os títulos de seção foram numerados e o " +
  "texto dividido em trechos para busca.";

function citation(overrides: Partial<NotebookCitation> = {}): NotebookCitation {
  return {
    number: 1,
    chunk_id: 10,
    source_id: 7,
    source_title: "Aço",
    source_url: "https://pt.wikipedia.org/wiki/A%C3%A7o",
    source_attribution: WIKI_CREDIT,
    heading: null,
    page_start: null,
    page_end: null,
    excerpt: "O aço é uma liga de ferro e carbono.",
    ...overrides,
  };
}

function answerWith(citations: NotebookCitation[]): NotebookAnswer {
  return {
    paragraphs: [{ text: "O aço é uma liga.", citations: citations.map((c) => c.number) }],
    citations,
    withheld: [],
    not_found: false,
  };
}

async function openChip(number: number, title: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: t.citation(number, title) }));
  return screen.getByRole("dialog", { name: t.citation(number, title) });
}

/**
 * D-97: an external passage keeps the credit its licence asks for wherever it
 * is quoted. In the conversation that is a secondary line under the excerpt,
 * and a citation without a credit draws nothing — it is optional metadata, not
 * a missing value, so there is no dash and no empty line to read.
 */
describe("AnswerView — attribution in the citation (D-97)", () => {
  it("draws the full CC BY-SA credit under the excerpt, as secondary text", async () => {
    const { container } = render(
      <AnswerView answer={answerWith([citation()])} liveSourceIds={new Set([7])} />,
    );
    const panel = await openChip(1, "Aço");

    const credit = within(panel).getByText(WIKI_CREDIT, { exact: false });
    expect(credit.textContent).toBe(`${t.reader.attribution}: ${WIKI_CREDIT}`);
    expect(credit).toHaveClass("text-caption", "text-ink-muted");
    // Under the excerpt, not above it.
    const quote = within(panel).getByText(citation().excerpt);
    expect(quote.compareDocumentPosition(credit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it("keeps the credit when the source has left the notebook", async () => {
    render(<AnswerView answer={answerWith([citation()])} liveSourceIds={new Set()} />);
    const panel = await openChip(1, "Aço");
    expect(within(panel).getByText(t.citationGone)).toBeInTheDocument();
    expect(within(panel).getByText(WIKI_CREDIT, { exact: false })).toBeInTheDocument();
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["blank", "   "],
  ])("draws no credit line when the attribution is %s", async (_case, value) => {
    const own = citation({
      source_title: "Apostila de metais",
      source_url: null,
      source_attribution: value,
    });
    if (value === undefined) delete own.source_attribution;
    render(<AnswerView answer={answerWith([own])} liveSourceIds={new Set([7])} />);
    const panel = await openChip(1, "Apostila de metais");

    expect(within(panel).queryByText(new RegExp(t.reader.attribution))).not.toBeInTheDocument();
    expect(within(panel).queryByText("—")).not.toBeInTheDocument();
    expect(panel.querySelector(".text-caption")).toBeNull();
    expect(within(panel).getByText(own.excerpt)).toBeInTheDocument();
  });
});
