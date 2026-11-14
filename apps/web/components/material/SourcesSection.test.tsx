import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceReference } from "@/lib/types";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { SourcesSection } from "./SourcesSection";

const t = curadoriaText.cite;

const full: SourceReference = {
  id: 1,
  label: "Ashby 2011",
  reference: null,
  authors: "ASHBY, Michael F.",
  title: "Materials selection in mechanical design",
  publisher: "Butterworth-Heinemann",
  year: 2011,
  url: "https://exemplo.org/livro",
  accessed_on: "2026-11-13",
  abnt:
    "ASHBY, Michael F. Materials selection in mechanical design. Butterworth-Heinemann, 2011. " +
    "Disponível em: https://exemplo.org/livro. Acesso em: 13 nov. 2026.",
};

const bare: SourceReference = {
  id: 2,
  label: "Dataset de exemplo",
  reference: "Conjunto de dados de exemplo.",
  authors: null,
  title: null,
  publisher: null,
  year: null,
  url: null,
  accessed_on: null,
  abnt: "DATASET de exemplo. Conjunto de dados de exemplo.",
};

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("Citar fonte (ABNT) na ficha (D-233)", () => {
  it("mostra cada fonte com a citação que o servidor montou, sem reescrevê-la", () => {
    render(<SourcesSection sources={[full, bare]} />);
    expect(screen.getByText("Ashby 2011")).toBeInTheDocument();
    expect(screen.getByText(full.abnt)).toBeInTheDocument();
    expect(screen.getByText(bare.abnt)).toBeInTheDocument();
    // Nothing is made up on the screen for a part the record lacks.
    expect(screen.queryByText(/s\.d\./)).toBeNull();
  });

  it("um clique copia exatamente o texto do servidor e diz que copiou", async () => {
    // `userEvent.setup()` installs its own clipboard stub, so ours goes in after it.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<SourcesSection sources={[full, bare]} />);

    await user.click(screen.getByRole("button", { name: t.buttonFor("Dataset de exemplo") }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(bare.abnt);
    expect(await screen.findByText(t.done)).toBeInTheDocument();
  });

  it("cada botão copia a citação da sua própria fonte", async () => {
    // `userEvent.setup()` installs its own clipboard stub, so ours goes in after it.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<SourcesSection sources={[full, bare]} />);
    await user.click(screen.getByRole("button", { name: t.buttonFor("Ashby 2011") }));
    expect(writeText).toHaveBeenLastCalledWith(full.abnt);
  });

  it("o botão tem o nome da fonte, para quem escuta a lista de botões iguais", () => {
    render(<SourcesSection sources={[full, bare]} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: t.buttonFor("Ashby 2011") })).toHaveTextContent(t.button);
  });

  it("se o navegador recusa, diz em palavras e mantém o texto à vista para copiar à mão", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("negado")) },
      configurable: true,
    });
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
    render(<SourcesSection sources={[bare]} />);
    await user.click(screen.getByRole("button", { name: t.buttonFor("Dataset de exemplo") }));
    await waitFor(() => expect(screen.getByText(t.failed)).toBeInTheDocument());
    expect(screen.getByText(bare.abnt)).toBeInTheDocument();
  });

  it("sem fontes, escreve a ausência em vez de deixar o bloco em branco", () => {
    render(<SourcesSection sources={[]} />);
    expect(screen.getByText(t.none)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("não tem violações de acessibilidade", async () => {
    const { container } = render(<SourcesSection sources={[full, bare]} />);
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
