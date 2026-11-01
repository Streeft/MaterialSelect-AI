import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { MAX_COMPUTED, expressionKey } from "@/lib/compare-expression";
import { expressionText } from "@/lib/i18n-expression";

const evaluate = vi.hoisted(() => vi.fn());
const describeExpression = vi.hoisted(() => vi.fn());
const getExpressionPalette = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  }
  return { ApiError, evaluateIndex: evaluate, describeExpression, getExpressionPalette };
});

const { CustomIndexForm } = await import("./CustomIndexForm");
const { ApiError } = await import("@/lib/api");

const t = ptBR.compare.computed.custom;

function mount(overrides: Partial<Parameters<typeof CustomIndexForm>[0]> = {}) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <CustomIndexForm
        expressions={[]}
        takenKeys={new Set()}
        total={0}
        onAdd={onAdd}
        onRemove={onRemove}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { ...view, onAdd, onRemove };
}

/** The calculator opens in "Montar"; these tests type the syntax in "Digitar". */
async function typeExpression(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole("button", { name: expressionText.modeType }));
  await user.type(screen.getByLabelText(t.label), text);
}

describe("CustomIndexForm: índice digitado no comparador (D-153)", () => {
  beforeEach(() => {
    evaluate.mockReset();
    describeExpression.mockReset();
    getExpressionPalette.mockReset();
    getExpressionPalette.mockResolvedValue({
      universe: "material",
      variables: [],
      functions: [],
      constants: [],
    });
    describeExpression.mockImplementation(async (expression: string) => ({
      expression,
      valid: true,
      normalized: expression,
      latex: "x",
      latex_symbols: "x",
      label: expression === "densidade * 2" ? "Densidade × 2" : expression,
      dimension: "dimensionless",
      unit: "dimensionless",
      is_multiplicative: true,
      variables: [],
      errors: [],
      tree: null,
    }));
  });

  it("manda a expressão ao validador do servidor e só então a adiciona", async () => {
    evaluate.mockResolvedValue({ dimension: "meter ** 2 / second ** 2" });
    const user = userEvent.setup();
    const { onAdd } = mount();

    await typeExpression(user, "  modulo_young / densidade ");
    await user.click(screen.getByRole("button", { name: t.add }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("modulo_young / densidade"));
    expect(evaluate).toHaveBeenCalledWith("modulo_young / densidade", "maximize");
    expect(screen.getByLabelText(t.label)).toHaveValue("");
  });

  it("mostra a mensagem escrita do servidor e não adiciona a expressão recusada", async () => {
    evaluate.mockRejectedValue(new ApiError("Variáveis desconhecidas: xyz", 400));
    const user = userEvent.setup();
    const { onAdd } = mount();

    await typeExpression(user, "xyz / densidade");
    await user.click(screen.getByRole("button", { name: t.add }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Variáveis desconhecidas: xyz");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t.label)).toHaveValue("xyz / densidade");
  });

  it("falha que não é do servidor também é escrita", async () => {
    evaluate.mockRejectedValue(new Error("rede"));
    const user = userEvent.setup();
    mount();

    await typeExpression(user, "densidade * 2");
    await user.click(screen.getByRole("button", { name: t.add }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.genericError);
  });

  it("campo vazio, duplicada e limite são recusados sem chamar o servidor", async () => {
    const user = userEvent.setup();
    const { onAdd } = mount({ takenKeys: new Set([expressionKey("a/b")]) });

    await user.click(screen.getByRole("button", { name: t.add }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.empty);

    await typeExpression(user, "a / b");
    await user.click(screen.getByRole("button", { name: t.add }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.duplicate);

    expect(evaluate).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("no limite de colunas diz o limite", async () => {
    const user = userEvent.setup();
    mount({ total: MAX_COMPUTED });

    await typeExpression(user, "densidade * 2");
    await user.click(screen.getByRole("button", { name: t.add }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.limit(MAX_COMPUTED));
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("lista as expressões adicionadas pela leitura amigável, nunca pela gramática (D-191)", async () => {
    const user = userEvent.setup();
    const { onRemove } = mount({ expressions: ["densidade * 2"] });

    await user.click(await screen.findByRole("button", { name: `${t.remove}: Densidade × 2` }));
    expect(onRemove).toHaveBeenCalledWith("densidade * 2");
    expect(screen.queryByText("densidade * 2")).not.toBeInTheDocument();
  });

  it("passa no axe, com erro e com expressões listadas", async () => {
    evaluate.mockRejectedValue(new ApiError("Expressão vazia.", 400));
    const user = userEvent.setup();
    const { container } = mount({ expressions: ["densidade * 2"] });
    await typeExpression(user, "x");
    await user.click(screen.getByRole("button", { name: t.add }));
    await screen.findByRole("alert");

    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("compare-expression", () => {
  it("a chave ignora espaços", () => {
    expect(expressionKey("a / b")).toBe(expressionKey("a/b"));
  });
});
