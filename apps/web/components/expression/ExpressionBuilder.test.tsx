import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ExpressionDescription, ExpressionPalette } from "@materialselect/shared-types";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { expressionText as t } from "@/lib/i18n-expression";

const describeExpression = vi.hoisted(() => vi.fn());
const getExpressionPalette = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ describeExpression, getExpressionPalette }));

const { ExpressionBuilder } = await import("./ExpressionBuilder");
const { ExpressionLabel } = await import("./ExpressionLabel");

const PALETTE: ExpressionPalette = {
  universe: "material",
  variables: [
    {
      variable: "densidade",
      slug: "densidade",
      name: "Densidade",
      symbol: "ρ",
      symbol_latex: "\\rho",
      unit: "kg/m**3",
      display_unit: "g/cm**3",
      category: "FISICA",
      description: null,
    },
    {
      variable: "modulo_young",
      slug: "modulo_young",
      name: "Módulo de Young",
      symbol: "E",
      symbol_latex: "E",
      unit: "Pa",
      display_unit: "GPa",
      category: "MECANICA",
      description: null,
    },
    {
      variable: "limite_escoamento",
      slug: "limite_escoamento",
      name: "Limite de escoamento",
      symbol: "σy",
      symbol_latex: "\\sigma_{\\mathrm{y}}",
      unit: "Pa",
      display_unit: "MPa",
      category: "MECANICA",
      description: null,
    },
  ],
  functions: [
    { name: "sqrt", min_args: 1, max_args: 1, label: "√x", latex: "\\sqrt{x}", description: "Raiz quadrada." },
    { name: "cbrt", min_args: 1, max_args: 1, label: "∛x", latex: "\\sqrt[3]{x}", description: "Raiz cúbica." },
    { name: "ln", min_args: 1, max_args: 1, label: "ln", latex: "\\ln(x)", description: "Logaritmo natural." },
  ],
  constants: [{ name: "pi", latex: "\\pi", label: "π", description: "A constante π." }],
};

function described(expression: string, overrides: Partial<ExpressionDescription> = {}): ExpressionDescription {
  return {
    expression,
    valid: true,
    normalized: expression,
    latex: "\\frac{\\text{Módulo de Young}}{\\text{Densidade}}",
    latex_symbols: "\\frac{E}{\\rho}",
    label: "Módulo de Young / Densidade",
    dimension: "[length] ** 2 / [time] ** 2",
    unit: "Pa*m**3/kg",
    is_multiplicative: true,
    variables: [],
    errors: [],
    tree: null,
    ...overrides,
  };
}

function Harness({ initial = "", onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ExpressionBuilder
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
      />
      <output data-testid="grammar">{value}</output>
    </>
  );
}

function mount(initial = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onValue = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} onValue={onValue} />
    </QueryClientProvider>,
  );
  return { ...view, onValue, grammar: () => screen.getByTestId("grammar").textContent };
}

/** A `DataTransfer` stand-in: jsdom has none. */
function dataTransfer() {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? "",
    effectAllowed: "all",
    dropEffect: "none",
    types: [] as string[],
  };
}

describe("ExpressionBuilder: calculadora visual (D-191)", () => {
  beforeEach(() => {
    describeExpression.mockReset();
    getExpressionPalette.mockReset();
    getExpressionPalette.mockResolvedValue(PALETTE);
    describeExpression.mockImplementation(async (expression: string) => described(expression));
  });

  it("monta E^(1/2)/ρ só com cliques, sem nunca mostrar o nome interno", async () => {
    const user = userEvent.setup();
    const { grammar } = mount();
    const young = await screen.findByRole("button", { name: t.insertCard("Módulo de Young") });

    await user.click(young);
    await user.click(screen.getByRole("button", { name: t.keys.power }));
    await user.click(screen.getByRole("button", { name: t.keys.open }));
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: t.keys.divide }));
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: t.keys.close }));
    await user.click(screen.getByRole("button", { name: t.keys.divide }));
    // Densidade está numa categoria fechada: a busca a traz.
    await user.type(screen.getByLabelText(t.searchLabel), "densidade{Enter}");

    expect(grammar()).toBe("modulo_young ** (1 / 2) / densidade");
    const tape = screen.getByTestId("expression-tape");
    expect(within(tape).getByRole("button", { name: t.tokenPiece(t.tokenProperty("Módulo de Young"), 1) })).toBeInTheDocument();
    expect(tape).not.toHaveTextContent("modulo_young");
    // O visor mostra o que o backend descreveu, com debounce.
    await waitFor(() =>
      expect(describeExpression).toHaveBeenCalledWith("modulo_young ** (1 / 2) / densidade", "material"),
    );
    expect(await screen.findByText(t.valid)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Módulo de Young / Densidade" })).toBeInTheDocument();
  });

  it("a busca ignora acento e o Enter insere o primeiro cartão", async () => {
    const user = userEvent.setup();
    const { grammar } = mount();
    await screen.findByRole("button", { name: t.insertCard("Módulo de Young") });

    await user.type(screen.getByLabelText(t.searchLabel), "modulo");
    expect(screen.getByText(t.results(1))).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(grammar()).toBe("modulo_young");
    expect(screen.getByLabelText(t.searchLabel)).toHaveValue("");

    await user.type(screen.getByLabelText(t.searchLabel), "raiz");
    await user.keyboard("{Enter}");
    expect(grammar()).toBe("modulo_young sqrt()");
  });

  it("arrastar um cartão até a fita insere a propriedade; arrastar uma peça a move", async () => {
    const { grammar } = mount("densidade");
    const card = await screen.findByRole("button", { name: t.insertCard("Módulo de Young") });
    const tape = screen.getByTestId("expression-tape");

    const transfer = dataTransfer();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragOver(tape, { dataTransfer: transfer });
    fireEvent.drop(tape, { dataTransfer: transfer });
    expect(grammar()).toBe("densidade modulo_young");

    // Reordenar: a última peça vai para antes da primeira.
    const pieces = within(tape).getAllByRole("button");
    const move = dataTransfer();
    fireEvent.dragStart(pieces[1]!, { dataTransfer: move });
    fireEvent.drop(pieces[0]!, { dataTransfer: move, clientX: 0 });
    expect(grammar()).toBe("modulo_young densidade");
  });

  it("no teclado: a fita aceita operadores, setas, apagar e desfazer; letra abre a busca", async () => {
    const user = userEvent.setup();
    const { grammar } = mount("modulo_young");
    await screen.findByRole("button", { name: t.insertCard("Módulo de Young") });
    const tape = screen.getByRole("group", { name: t.tapeLabel });

    tape.focus();
    await user.keyboard("/2");
    expect(grammar()).toBe("modulo_young / 2");
    await user.keyboard("{Backspace}");
    expect(grammar()).toBe("modulo_young /");
    await user.keyboard("{Control>}z{/Control}");
    expect(grammar()).toBe("modulo_young / 2");
    await user.keyboard("{Home}{Delete}");
    expect(grammar()).toBe("/ 2");

    await user.keyboard("d");
    expect(screen.getByLabelText(t.searchLabel)).toHaveFocus();
    expect(screen.getByLabelText(t.searchLabel)).toHaveValue("d");
  });

  it("uma tecla de função escreve o parêntese e marca no visor a peça com erro", async () => {
    const user = userEvent.setup();
    describeExpression.mockImplementation(async (expression: string) =>
      described(expression, {
        valid: false,
        latex: null,
        label: null,
        errors: [{ message: "ln() só aceita argumento adimensional", start: 0, end: 16 }],
      }),
    );
    const { grammar } = mount();
    await user.click(await screen.findByRole("button", { name: /^ln:/ }));
    await user.click(screen.getByRole("button", { name: t.insertCard("Módulo de Young") }));
    expect(grammar()).toBe("ln(modulo_young)");

    expect(await screen.findByText("ln() só aceita argumento adimensional")).toBeInTheDocument();
    const tape = screen.getByTestId("expression-tape");
    await waitFor(() => expect(tape.querySelectorAll("[data-flagged=true]").length).toBeGreaterThan(0));
  });

  it("o modo Digitar mantém o texto e volta a virar cartões", async () => {
    const user = userEvent.setup();
    const { grammar } = mount("modulo_young / densidade");
    await screen.findByRole("button", { name: t.insertCard("Módulo de Young") });

    await user.click(screen.getByRole("button", { name: t.modeType }));
    const field = screen.getByLabelText(t.typeLabel);
    expect(field).toHaveValue("modulo_young / densidade");
    await user.clear(field);
    await user.type(field, "sqrt(modulo_young)");
    expect(grammar()).toBe("sqrt(modulo_young)");

    await user.click(screen.getByRole("button", { name: t.modeBuild }));
    const tape = screen.getByTestId("expression-tape");
    expect(within(tape).getByRole("button", { name: t.tokenPiece(t.tokenFunction("√"), 1) })).toBeInTheDocument();
    expect(within(tape).getByRole("button", { name: t.tokenPiece(t.tokenProperty("Módulo de Young"), 2) })).toBeInTheDocument();
  });

  it("um exemplo carrega a fórmula e a notação troca nomes por símbolos", async () => {
    const user = userEvent.setup();
    const { grammar } = mount();
    await user.click(await screen.findByRole("button", { name: /Viga leve e rígida/ }));
    expect(grammar()).toBe("modulo_young ** (1/2) / densidade");

    await screen.findByText(t.valid);
    await user.click(screen.getByRole("button", { name: t.showSymbols }));
    expect(screen.getByRole("button", { name: t.showSymbols })).toHaveAttribute("aria-pressed", "true");
  });

  it("não tem violação de acessibilidade (axe), vazia e preenchida", async () => {
    const { container } = mount();
    await screen.findByRole("button", { name: t.insertCard("Módulo de Young") });
    let violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: t.insertCard("Módulo de Young") }));
    await screen.findByText(t.valid);
    violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("ExpressionLabel: o índice como o leitor o lê (D-191)", () => {
  beforeEach(() => {
    describeExpression.mockReset();
    describeExpression.mockImplementation(async (expression: string) => described(expression));
  });

  it("mostra o LaTeX amigável, nunca o nome interno", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ExpressionLabel expression="modulo_young / densidade" />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("img", { name: "Módulo de Young / Densidade" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("modulo_young");
  });

  it("sem cliente de consulta (teste isolado) mostra o texto como foi escrito", () => {
    render(<ExpressionLabel expression="a / b" />);
    expect(screen.getByText("a / b")).toBeInTheDocument();
  });

  it("enquanto carrega, guarda o lugar sem mostrar a gramática", async () => {
    let resolve: (v: ExpressionDescription) => void = () => {};
    describeExpression.mockImplementation(() => new Promise((r) => (resolve = r)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ExpressionLabel expression="modulo_young / densidade" />
      </QueryClientProvider>,
    );
    expect(document.body).not.toHaveTextContent("modulo_young");
    await act(async () => resolve(described("modulo_young / densidade")));
    expect(await screen.findByRole("img", { name: "Módulo de Young / Densidade" })).toBeInTheDocument();
  });
});
