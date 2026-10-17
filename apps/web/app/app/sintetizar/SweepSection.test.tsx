import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { PerformanceIndex, SweepRequest, SweepResult } from "@/lib/types";
import { scalarSweep, pairSweep } from "@/components/charts/sweepFixtures";

const t = ptBR.synthesis.sweep;

const sweepSynthesis = vi.fn<(body: SweepRequest) => Promise<SweepResult>>();

const indices: PerformanceIndex[] = [
  {
    id: 3,
    name: "Leveza sob flexão",
    slug: "leveza",
    expression: "E^(1/3)/rho",
    goal: "maximize",
    description: null,
    assumptions: null,
    dimension: null,
    is_demo: false,
  },
];

vi.mock("@/lib/api", async () => {
  class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    listPerformanceIndices: () => Promise.resolve(indices),
    sweepSynthesis: (body: SweepRequest) => sweepSynthesis(body),
  };
});

const { SweepSection, sweepErrorMessage } = await import("./SweepSection");
const { ApiError } = await import("@/lib/api");

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

async function open(props: { kind?: string; a?: string; b?: string } = {}) {
  const view = render(
    wrap(<SweepSection kind={props.kind ?? "composito"} parentA={props.a ?? "1"} parentB={props.b ?? "2"} />),
  );
  await screen.findByShadowText(t.indexLabel);
  return view;
}

const runButton = () => screen.findByShadowRole("button", { name: t.run });

beforeEach(() => {
  sweepSynthesis.mockReset();
  sweepSynthesis.mockResolvedValue(scalarSweep);
});

describe("Varrer (D-144)", () => {
  it("passa no axe e começa com o estado vazio escrito", async () => {
    const { container } = await open();
    expect(screen.getByText(t.idleTitle)).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("manda os pais e o tipo da receita e o índice escolhido, com a grade padrão do compósito", async () => {
    const user = userEvent.setup();
    await open({ a: "5", b: "9" });
    await user.click(await runButton());
    await waitFor(() => expect(sweepSynthesis).toHaveBeenCalled());
    expect(sweepSynthesis.mock.calls[0]![0]).toEqual({
      kind: "composito",
      parent_a_id: 5,
      parent_b_id: 9,
      start: 0.1,
      stop: 0.9,
      steps: 9,
      spacing: "linear",
      index: { name: "Leveza sob flexão", expression: "E^(1/3)/rho", goal: "maximize" },
    });
  });

  it("mostra a nota da API e o passo sem índice com o motivo escrito", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await runButton());
    expect(await screen.findByText(scalarSweep.note)).toBeInTheDocument();
    expect(screen.getAllByText(/O constituinte não tem o dado necessário/).length).toBeGreaterThan(0);
  });

  it("mostra o par mínimo/máximo do compósito como faixa", async () => {
    sweepSynthesis.mockResolvedValue(pairSweep);
    const user = userEvent.setup();
    const { container } = await open();
    await user.click(await runButton());
    await screen.findByText(t.chart.band);
    expect(container.querySelectorAll("[data-sweep-band]")).toHaveLength(1);
  });

  it("explica por que o botão está desabilitado quando os dois materiais são iguais", async () => {
    await open({ a: "2", b: "2" });
    expect(await runButton()).toBeDisabled();
    expect(screen.getByText(t.blocked.parents)).toBeInTheDocument();
  });

  it("diz que a varredura não vale para a espuma", () => {
    render(wrap(<SweepSection kind="espuma" parentA="1" parentB="" />));
    expect(screen.getByText(t.unavailable)).toBeInTheDocument();
  });

  it("mostra em pt-BR o erro 400, 404 e 422", async () => {
    expect(sweepErrorMessage(new ApiError("Face e núcleo iguais.", 400))).toBe(
      `${t.error400}: Face e núcleo iguais.`,
    );
    expect(sweepErrorMessage(new ApiError("Not found", 404))).toBe(t.error404);
    expect(sweepErrorMessage(new ApiError("Input should be greater than 0", 422))).toBe(t.error422);
    expect(sweepErrorMessage(new Error("rede"))).toBe(t.errorGeneric);

    sweepSynthesis.mockRejectedValue(new ApiError("Face e núcleo iguais.", 400));
    const user = userEvent.setup();
    await open();
    await user.click(await runButton());
    expect(await screen.findByText(t.errorTitle)).toBeInTheDocument();
    expect(screen.getByText(`${t.error400}: Face e núcleo iguais.`)).toBeInTheDocument();
  });
});
