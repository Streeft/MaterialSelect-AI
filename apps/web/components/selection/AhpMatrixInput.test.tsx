import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
// See the note in app/selecao/selecao.test.tsx: MWC control roles live inside
// a shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { selectMwcOption } from "@/lib/testing/mwc";
import type { AhpWeightsIn, AhpWeightsOut } from "@/lib/types";

const t = ptBR.selection.ahp;

const deriveAhpWeights = vi.fn<(payload: AhpWeightsIn) => Promise<AhpWeightsOut>>();

class MockApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

vi.mock("@/lib/api", () => ({
  ApiError: MockApiError,
  deriveAhpWeights: (payload: AhpWeightsIn) => deriveAhpWeights(payload),
}));

const { AhpMatrixInput } = await import("./AhpMatrixInput");

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const criteria = [
  { key: "densidade", label: "Densidade" },
  { key: "modulo_young", label: "Módulo de Young" },
  { key: "custo", label: "Custo" },
];

function ok(overrides: Partial<AhpWeightsOut> = {}): AhpWeightsOut {
  return {
    weights: { densidade: 0.6, modulo_young: 0.3, custo: 0.1 },
    lambda_max: 3.01,
    consistency_index: 0.005,
    consistency_ratio: 0.009,
    ...overrides,
  };
}

beforeEach(() => {
  deriveAhpWeights.mockReset();
});

describe("AhpMatrixInput", () => {
  it("builds the full n×n matrix from only the upper-triangle judgments, filling the rest itself", async () => {
    deriveAhpWeights.mockResolvedValue(ok());
    render(wrap(<AhpMatrixInput criteria={criteria} onDerived={vi.fn()} />));

    // Each pair's `<select>` carries its accessible name only via `aria-label`
    // (per Input's own documented "named by the table" exception — see the
    // component) — MWC's aria-delegation shifts that onto the shadow-internal
    // combobox in a way this environment's accessible-name computation
    // doesn't resolve, so tests address cells by their fixed render order
    // (upper triangle, row-major: (densidade,modulo_young), (densidade,custo),
    // (modulo_young,custo)) instead of by name.
    const comboboxes = await screen.findAllByShadowRole("combobox");
    expect(comboboxes).toHaveLength(3);
    // (densidade, modulo_young): "5 — fortemente mais importante".
    selectMwcOption(comboboxes.at(0)!, "5");

    await waitFor(() => expect(deriveAhpWeights).toHaveBeenCalled());
    const payload = deriveAhpWeights.mock.calls.at(-1)?.[0];
    expect(payload?.criteria).toEqual(["densidade", "modulo_young", "custo"]);
    // Row 0 (densidade): the one judgment made, plus the untouched pair
    // defaulting to "equal importance" — never left unset.
    expect(payload?.matrix[0]).toEqual([1, 5, 1]);
    // Row 1 (modulo_young): the reciprocal of the one judgment made, computed
    // by the component — nobody was asked for it.
    expect(payload?.matrix[1]?.[0]).toBeCloseTo(1 / 5);
    expect(payload?.matrix[1]?.[1]).toBe(1);
    // Row 2 (custo): untouched, so every off-diagonal entry defaults to 1.
    expect(payload?.matrix[2]).toEqual([1, 1, 1]);
    // The diagonal is fixed at 1 everywhere, never something a judgment set.
    expect(payload?.matrix[0]?.[0]).toBe(1);
    expect(payload?.matrix[2]?.[2]).toBe(1);
  });

  it("applies the derived weights, and shows the consistency ratio, only on a successful response", async () => {
    deriveAhpWeights.mockResolvedValue(ok({ consistency_ratio: 0 }));
    const onDerived = vi.fn();
    render(wrap(<AhpMatrixInput criteria={criteria} onDerived={onDerived} />));

    await waitFor(() =>
      expect(onDerived).toHaveBeenCalledWith({ densidade: 0.6, modulo_young: 0.3, custo: 0.1 }),
    );
    expect(await screen.findByText(/Consistência: 0,00 — ok/)).toBeInTheDocument();
  });

  it("shows the backend's rejection for an inconsistent matrix and never forwards weights", async () => {
    deriveAhpWeights.mockRejectedValue(
      new MockApiError(
        "Julgamentos inconsistentes demais (razão de consistência 0.34, limite 0.1). " +
          "Revise as comparações.",
        400,
      ),
    );
    const onDerived = vi.fn();
    render(wrap(<AhpMatrixInput criteria={criteria} onDerived={onDerived} />));

    expect(await screen.findByText(/Julgamentos inconsistentes demais/)).toBeInTheDocument();
    expect(onDerived).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Consistência:/)).not.toBeInTheDocument();
  });

  it("asks for at least two named criteria instead of calling the API with fewer", () => {
    const onDerived = vi.fn();
    render(wrap(<AhpMatrixInput criteria={criteria.slice(0, 1)} onDerived={onDerived} />));

    expect(screen.getByText(t.needsCriteria)).toBeInTheDocument();
    expect(deriveAhpWeights).not.toHaveBeenCalled();
  });
});
