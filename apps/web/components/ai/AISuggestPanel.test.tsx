import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { suggestText as t } from "@/lib/i18n-suggest";
import { installWideViewport } from "@/lib/testing/viewport";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { AIStatus, SuggestAction, SuggestionsOut, SuggestTool } from "@/lib/types";
import { AISuggestPanel } from "./AISuggestPanel";

const getAIStatus = vi.fn<() => Promise<AIStatus>>();
const suggestNextSteps =
  vi.fn<(tool: SuggestTool, context: Record<string, unknown>, signal?: AbortSignal) => Promise<SuggestionsOut>>();
vi.mock("@/lib/api", () => ({
  getAIStatus: () => getAIStatus(),
  suggestNextSteps: (tool: SuggestTool, context: Record<string, unknown>, signal?: AbortSignal) =>
    suggestNextSteps(tool, context, signal),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function answer(over: Partial<SuggestionsOut> = {}): SuggestionsOut {
  return {
    tool: "mapas",
    summary: "Dois caminhos para explorar o mapa.",
    suggestions: [
      {
        title: "Troque o eixo Y",
        body: "Mantendo a densidade no X, a resistência tem mais valores.",
        actions: [{ type: "set_axes", label: "Usar estes eixos", x: "densidade", y: "limite_escoamento" }],
      },
      {
        title: "Abrir o mapa clássico",
        body: "Resistência por densidade.",
        actions: [
          { type: "apply_preset", label: "Abrir este mapa", id: "resistencia-densidade" },
          { type: "open_route", label: "Ver o catálogo", path: "/app/catalogo" },
        ],
      },
    ],
    rejected: [],
    degraded: false,
    cached: false,
    notice: null,
    provider: "mock",
    simulated: true,
    disclaimer: "Sugestões de apoio; confira antes de decidir.",
    ...over,
  };
}

const SUPPORTED = ["set_axes", "apply_preset", "open_route"] as const;
const CONTEXT = { x: "densidade", y: "modulo_young", index_slug: null };

function panel(onAction = vi.fn(), extra: Record<string, unknown> = {}) {
  return (
    <AISuggestPanel tool="mapas" context={CONTEXT} actions={SUPPORTED} onAction={onAction} {...extra} />
  );
}

beforeEach(() => {
  getAIStatus.mockReset();
  suggestNextSteps.mockReset();
  getAIStatus.mockResolvedValue({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AISuggestPanel — Sugestão da IA (D-229)", () => {
  it("shows only what the screen's own check accepts (D-230b)", async () => {
    suggestNextSteps.mockResolvedValue(
      answer({
        suggestions: [
          {
            title: "Ajuste o lote",
            body: "Dois parâmetros.",
            actions: [
              { type: "set_param", label: "lote: 2000", name: "batch_size", value: 2000 },
              { type: "set_param", label: "tensão: 3", name: "voltagem", value: 3 },
              { type: "open_route", label: "Ver o catálogo", path: "/app/catalogo" },
            ],
          },
        ],
      }),
    );
    const accepts = (action: SuggestAction) => action.type !== "set_param" || action.name === "batch_size";
    const user = userEvent.setup();
    render(
      wrap(
        <AISuggestPanel
          tool="custo"
          context={{}}
          actions={["set_param", "open_route"]}
          accepts={accepts}
          onAction={vi.fn()}
        />,
      ),
    );
    await user.click(await screen.findByRole("button", { name: t.button }));
    expect(await screen.findByRole("button", { name: "lote: 2000" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "tensão: 3" })).toBeNull();
    // The check is not for a route: it stays a link.
    expect(screen.getByRole("link", { name: "Ver o catálogo" })).toBeTruthy();
  });

  it("asks only when the button is clicked, with the tool and the context", async () => {
    suggestNextSteps.mockResolvedValue(answer());
    const user = userEvent.setup();
    render(wrap(panel()));
    const button = await screen.findByRole("button", { name: t.button });
    expect(suggestNextSteps).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await user.click(button);
    expect(await screen.findByText("Troque o eixo Y")).toBeTruthy();
    expect(suggestNextSteps).toHaveBeenCalledTimes(1);
    expect(suggestNextSteps.mock.calls[0]?.[0]).toBe("mapas");
    expect(suggestNextSteps.mock.calls[0]?.[1]).toEqual(CONTEXT);
    expect(screen.getByText("Dois caminhos para explorar o mapa.")).toBeTruthy();
    expect(screen.getByText("Sugestões de apoio; confira antes de decidir.")).toBeTruthy();
  });

  it("collapses and reopens without asking again", async () => {
    suggestNextSteps.mockResolvedValue(answer());
    const user = userEvent.setup();
    render(wrap(panel()));
    const button = await screen.findByRole("button", { name: t.button });
    await user.click(button);
    await screen.findByText("Troque o eixo Y");
    await user.click(button);
    expect(screen.queryByText("Troque o eixo Y")).toBeNull();
    await user.click(button);
    expect(await screen.findByText("Troque o eixo Y")).toBeTruthy();
    expect(suggestNextSteps).toHaveBeenCalledTimes(1);
  });

  it("says it is loading with a live region while the answer is on its way", async () => {
    let resolve: (value: SuggestionsOut) => void = () => {};
    suggestNextSteps.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    const status = await screen.findByText(t.loading);
    expect(status.closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
    resolve(answer());
    expect(await screen.findByText("Troque o eixo Y")).toBeTruthy();
    expect(screen.queryByText(t.loading)).toBeNull();
  });

  it("applies an action only on its click, through onAction", async () => {
    suggestNextSteps.mockResolvedValue(answer());
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(wrap(panel(onAction)));
    await user.click(await screen.findByRole("button", { name: t.button }));
    const apply = await screen.findByRole("button", { name: "Usar estes eixos" });
    expect(onAction).not.toHaveBeenCalled();
    await user.click(apply);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "set_axes",
      label: "Usar estes eixos",
      x: "densidade",
      y: "limite_escoamento",
    } satisfies SuggestAction);
  });

  it("folds itself after an action on a narrow window and keeps the answer", async () => {
    suggestNextSteps.mockResolvedValue(answer());
    const user = userEvent.setup();
    render(wrap(panel()));
    const button = await screen.findByRole("button", { name: t.button });
    await user.click(button);
    await user.click(await screen.findByRole("button", { name: "Usar estes eixos" }));
    expect(screen.queryByText("Troque o eixo Y")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await user.click(button);
    expect(await screen.findByText("Troque o eixo Y")).toBeTruthy();
    expect(suggestNextSteps).toHaveBeenCalledTimes(1);
  });

  it("renders open_route as a link to the screen, not as a script", async () => {
    suggestNextSteps.mockResolvedValue(answer());
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    const link = await screen.findByRole("link", { name: "Ver o catálogo" });
    expect(link.getAttribute("href")).toBe("/app/catalogo");
  });

  it("draws an action as a link when the screen says it is a navigation", async () => {
    suggestNextSteps.mockResolvedValue(
      answer({
        suggestions: [
          { title: "Buscar", body: "Texto.", actions: [{ type: "search", label: "Buscar aço", q: "aço" }] },
        ],
      }),
    );
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      wrap(
        panel(onAction, {
          actions: ["search"],
          linkFor: (action: SuggestAction) =>
            action.type === "search" ? `/app/catalogo?busca=${encodeURIComponent(action.q)}` : null,
        }),
      ),
    );
    await user.click(await screen.findByRole("button", { name: t.button }));
    const link = await screen.findByRole("link", { name: "Buscar aço" });
    expect(link.getAttribute("href")).toBe("/app/catalogo?busca=a%C3%A7o");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("ignores an action the screen did not list, and one with a broken shape", async () => {
    suggestNextSteps.mockResolvedValue(
      answer({
        suggestions: [
          {
            title: "Misto",
            body: "Uma ação serve e as outras não.",
            actions: [
              { type: "set_param", label: "Mudar parâmetro", name: "x", value: 1 },
              { type: "set_axes", label: "Eixos sem Y", x: "densidade", y: "" },
              { type: "open_route", label: "Outro site", path: "//example.com" },
              { type: "teleport", label: "Ação do futuro" } as unknown as SuggestAction,
              { type: "set_axes", label: "Eixos bons", x: "a", y: "b" },
            ],
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    await screen.findByText("Misto");
    expect(screen.getByRole("button", { name: "Eixos bons" })).toBeTruthy();
    for (const hidden of ["Mudar parâmetro", "Eixos sem Y", "Outro site", "Ação do futuro"]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
  });

  it("keeps a card without any usable action as plain advice", async () => {
    suggestNextSteps.mockResolvedValue(
      answer({
        suggestions: [
          { title: "Só leitura", body: "Confira as unidades.", actions: [{ type: "set_param", label: "X", name: "n", value: 1 }] },
        ],
      }),
    );
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    expect(await screen.findByText("Só leitura")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "X" })).toBeNull();
  });

  it("shows an error with the reason and tries again on request", async () => {
    suggestNextSteps.mockRejectedValueOnce(Object.assign(new Error("Servidor indisponível"), { status: 503 }));
    suggestNextSteps.mockResolvedValueOnce(answer());
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.errorTitle);
    expect(alert.textContent).not.toContain("Servidor indisponível");
    await user.click(screen.getByRole("button", { name: t.retry }));
    expect(await screen.findByText("Troque o eixo Y")).toBeTruthy();
    expect(suggestNextSteps).toHaveBeenCalledTimes(2);
  });

  it("on a 429 shows when to try again, in the server's own words", async () => {
    suggestNextSteps.mockRejectedValue(
      Object.assign(new Error("A cota gratuita do Google acabou por agora; tente em 37 s."), { status: 429 }),
    );
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.rateLimitedTitle);
    expect(alert.textContent).toContain("tente em 37 s");
  });

  it("flags a degraded answer honestly, with the server's notice", async () => {
    suggestNextSteps.mockResolvedValue(answer({ degraded: true, notice: "O Gemini não respondeu; regras locais." }));
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    expect(await screen.findByText("O Gemini não respondeu; regras locais.")).toBeTruthy();
    expect(screen.getByText(t.degradedTitle)).toBeTruthy();
  });

  it("explains a degraded answer even when the server sent no notice", async () => {
    suggestNextSteps.mockResolvedValue(answer({ degraded: true, notice: null }));
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    expect(await screen.findByText(t.degradedFallback)).toBeTruthy();
  });

  it("mentions the cache quietly", async () => {
    suggestNextSteps.mockResolvedValue(answer({ cached: true }));
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    expect(await screen.findByText(t.cached)).toBeTruthy();
  });

  it("states an empty answer instead of an empty box", async () => {
    suggestNextSteps.mockResolvedValue(answer({ suggestions: [], summary: "" }));
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    expect(await screen.findByText(t.empty)).toBeTruthy();
  });

  it("says the screen changed after the answer, and asks again only on request", async () => {
    suggestNextSteps.mockResolvedValue(answer());
    const user = userEvent.setup();
    const { rerender } = render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    await screen.findByText("Troque o eixo Y");
    expect(screen.queryByText(t.stale)).toBeNull();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <AISuggestPanel
          tool="mapas"
          context={{ ...CONTEXT, y: "limite_escoamento" }}
          actions={SUPPORTED}
          onAction={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(t.stale)).toBeTruthy();
    expect(suggestNextSteps).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: t.askAgain }));
    await waitFor(() => expect(suggestNextSteps).toHaveBeenCalledTimes(2));
    expect(suggestNextSteps.mock.calls[1]?.[1]).toEqual({ ...CONTEXT, y: "limite_escoamento" });
  });

  it("is disabled with the reason when the AI layer is off", async () => {
    getAIStatus.mockResolvedValue({ enabled: false, provider: "", simulated: true, disclaimer: "" });
    render(wrap(panel()));
    const button = await screen.findByRole("button", { name: t.button });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText(t.off)).toBeTruthy();
    expect(suggestNextSteps).not.toHaveBeenCalled();
  });

  it("is disabled with the screen's own reason when there is nothing to ask about yet", async () => {
    render(wrap(panel(vi.fn(), { disabledReason: "Escolha ao menos um material." })));
    const button = await screen.findByRole("button", { name: t.button });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Escolha ao menos um material.")).toBeTruthy();
  });

  it("stays usable when the AI status cannot be read", async () => {
    getAIStatus.mockRejectedValue(new Error("falhou"));
    suggestNextSteps.mockResolvedValue(answer());
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    expect(await screen.findByText("Troque o eixo Y")).toBeTruthy();
  });

  it("has no accessibility violations: collapsed, loading, ready and in error", async () => {
    suggestNextSteps.mockResolvedValueOnce(answer({ degraded: true, cached: true, rejected: ["Eixo desconhecido."] }));
    const user = userEvent.setup();
    const { container } = render(wrap(panel()));
    const button = await screen.findByRole("button", { name: t.button });
    let violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
    await user.click(button);
    await screen.findByText("Troque o eixo Y");
    violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("has no accessibility violations in the error state", async () => {
    suggestNextSteps.mockRejectedValue(Object.assign(new Error("x"), { status: 500 }));
    const user = userEvent.setup();
    const { container } = render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    await screen.findByRole("alert");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("AISuggestPanel — número escolhido pela IA (D-234)", () => {
  installWideViewport();
  const marked = (): SuggestionsOut =>
    answer({
      suggestions: [
        {
          title: "Densidade relativa",
          body: "Um valor entre os extremos.",
          actions: [
            { type: "set_param", label: "densidade relativa: 0,25 (sugestão da IA, revise)", name: "relative_density", value: 0.25, origin: "sugestao_ia" },
            { type: "set_param", label: "densidade relativa: 0,1", name: "relative_density", value: 0.1, origin: "contexto" },
          ],
        },
      ],
    });
  const render_ = (onAction = vi.fn()) =>
    render(
      wrap(
        <AISuggestPanel tool="sintetizar" context={{}} actions={["set_param"]} onAction={onAction} />,
      ),
    );

  beforeEach(() => {
    getAIStatus.mockResolvedValue({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" });
  });

  it("applies a value from the context at once, and a marked one only after the yes", async () => {
    suggestNextSteps.mockResolvedValue(marked());
    const onAction = vi.fn();
    const user = userEvent.setup();
    render_(onAction);
    await user.click(await screen.findByRole("button", { name: t.button }));

    await user.click(await screen.findByRole("button", { name: "densidade relativa: 0,1" }));
    expect(onAction).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /densidade relativa: 0,25/ }));
    const dialog = screen.getByRole("dialog", { name: t.confirmTitle });
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("sugestão a revisar");
    expect(onAction).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: t.confirmAction }));
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[1]?.[0]).toMatchObject({ name: "relative_density", value: 0.25, origin: "sugestao_ia" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("declining changes nothing and leaves the button unmarked", async () => {
    suggestNextSteps.mockResolvedValue(marked());
    const onAction = vi.fn();
    const user = userEvent.setup();
    render_(onAction);
    await user.click(await screen.findByRole("button", { name: t.button }));
    await user.click(await screen.findByRole("button", { name: /densidade relativa: 0,25/ }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(`(${t.appliedMark})`)).toBeNull();
  });

  it("has no accessibility violations with the confirmation open", async () => {
    suggestNextSteps.mockResolvedValue(marked());
    const user = userEvent.setup();
    const { container } = render_();
    await user.click(await screen.findByRole("button", { name: t.button }));
    await user.click(await screen.findByRole("button", { name: /densidade relativa: 0,25/ }));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});

describe("AISuggestPanel — janela larga", () => {
  installWideViewport();
  beforeEach(() => {
    getAIStatus.mockResolvedValue({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" });
  });

  it("stays open after an action on a wide window and marks it as applied", async () => {
    suggestNextSteps.mockResolvedValue(answer());
    const user = userEvent.setup();
    render(wrap(panel()));
    await user.click(await screen.findByRole("button", { name: t.button }));
    await user.click(await screen.findByRole("button", { name: "Usar estes eixos" }));
    expect(screen.getByText("Troque o eixo Y")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Usar estes eixos (${t.appliedMark})` })).toBeTruthy();
  });
});
