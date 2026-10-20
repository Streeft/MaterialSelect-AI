import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { MAX_COMPUTED, expressionKey, expressionVariable, usableExamples } from "@/lib/compare-expression";

const evaluate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  }
  return { ApiError, evaluateIndex: evaluate };
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
        slugs={["modulo_young", "densidade", "limite-escoamento"]}
        slugsLoading={false}
        onAdd={onAdd}
        onRemove={onRemove}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { ...view, onAdd, onRemove };
}

describe("CustomIndexForm: índice digitado no comparador (D-153)", () => {
  beforeEach(() => {
    evaluate.mockReset();
  });

  it("manda a expressão ao validador do servidor e só então a adiciona", async () => {
    evaluate.mockResolvedValue({ dimension: "meter ** 2 / second ** 2" });
    const user = userEvent.setup();
    const { onAdd } = mount();

    await user.type(screen.getByLabelText(t.label), "  modulo_young / densidade ");
    await user.click(screen.getByRole("button", { name: t.add }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("modulo_young / densidade"));
    expect(evaluate).toHaveBeenCalledWith("modulo_young / densidade", "maximize");
    expect(screen.getByLabelText(t.label)).toHaveValue("");
  });

  it("mostra a mensagem escrita do servidor e não adiciona a expressão recusada", async () => {
    evaluate.mockRejectedValue(new ApiError("Variáveis desconhecidas: xyz", 400));
    const user = userEvent.setup();
    const { onAdd } = mount();

    await user.type(screen.getByLabelText(t.label), "xyz / densidade");
    await user.click(screen.getByRole("button", { name: t.add }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Variáveis desconhecidas: xyz");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t.label)).toHaveValue("xyz / densidade");
  });

  it("falha que não é do servidor também é escrita", async () => {
    evaluate.mockRejectedValue(new Error("rede"));
    const user = userEvent.setup();
    mount();

    await user.type(screen.getByLabelText(t.label), "densidade * 2");
    await user.click(screen.getByRole("button", { name: t.add }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.genericError);
  });

  it("campo vazio, duplicada e limite são recusados sem chamar o servidor", async () => {
    const user = userEvent.setup();
    const { onAdd } = mount({ takenKeys: new Set([expressionKey("a/b")]) });

    await user.click(screen.getByRole("button", { name: t.add }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.empty);

    await user.type(screen.getByLabelText(t.label), "a / b");
    await user.click(screen.getByRole("button", { name: t.add }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.duplicate);

    expect(evaluate).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("no limite de colunas diz o limite", async () => {
    const user = userEvent.setup();
    mount({ total: MAX_COMPUTED });

    await user.type(screen.getByLabelText(t.label), "densidade * 2");
    await user.click(screen.getByRole("button", { name: t.add }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.limit(MAX_COMPUTED));
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("exemplos preenchem o campo, e só os que usam variáveis existentes aparecem", async () => {
    const user = userEvent.setup();
    mount();

    // `limite_escoamento` não está no catálogo da fixture (só `limite-escoamento`
    // com hífen, que vira `limite_escoamento`): este exemplo aparece.
    await user.click(
      screen.getByRole("button", { name: t.useExample("modulo_young / densidade") }),
    );
    expect(screen.getByLabelText(t.label)).toHaveValue("modulo_young / densidade");
    expect(
      screen.getByRole("button", { name: t.useExample("limite_escoamento / densidade") }),
    ).toBeInTheDocument();
  });

  it("sem as variáveis no catálogo, o exemplo não é oferecido", () => {
    mount({ slugs: ["densidade"] });
    expect(screen.queryByRole("group", { name: t.examples })).not.toBeInTheDocument();
  });

  it("lista as expressões digitadas com remoção nomeada pela expressão", async () => {
    const user = userEvent.setup();
    const { onRemove } = mount({ expressions: ["densidade * 2"] });

    await user.click(screen.getByRole("button", { name: `${t.remove}: densidade * 2` }));
    expect(onRemove).toHaveBeenCalledWith("densidade * 2");
  });

  it("estados de variáveis: carregando e vazio, escritos", () => {
    const { unmount } = mount({ slugs: undefined, slugsLoading: true });
    expect(screen.getByText(t.variablesLoading)).toBeInTheDocument();
    unmount();
    mount({ slugs: [] });
    expect(screen.getByText(t.variablesNone)).toBeInTheDocument();
  });

  it("passa no axe, com erro e com expressões listadas", async () => {
    evaluate.mockRejectedValue(new ApiError("Expressão vazia.", 400));
    const user = userEvent.setup();
    const { container } = mount({ expressions: ["densidade * 2"] });
    await user.type(screen.getByLabelText(t.label), "x");
    await user.click(screen.getByRole("button", { name: t.add }));
    await screen.findByRole("alert");

    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("compare-expression", () => {
  it("o nome da variável segue o safe_variable do backend", () => {
    expect(expressionVariable("modulo_young")).toBe("modulo_young");
    expect(expressionVariable("limite-escoamento")).toBe("limite_escoamento");
    expect(expressionVariable("2d")).toBe("_2d");
  });

  it("exemplos só com variáveis disponíveis; chave ignora espaços", () => {
    expect(usableExamples(new Set(["densidade"]))).toEqual([]);
    expect(usableExamples(new Set(["modulo_young", "densidade"]))).toContain(
      "modulo_young / densidade",
    );
    expect(expressionKey("a / b")).toBe(expressionKey("a/b"));
  });
});
