import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IndexCard, IndexPicker, describeCustomIndex, describeIndex } from "./IndexCard";
import { ResultsView } from "./ResultsView";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { PerformanceIndex, RunResult } from "@/lib/types";

function makeIndex(overrides: Partial<PerformanceIndex> = {}): PerformanceIndex {
  return {
    id: 1,
    name: "Viga leve limitada por rigidez",
    slug: "viga-leve-rigidez",
    expression: "modulo_young ** 0.5 / densidade",
    goal: "maximize",
    description: null,
    assumptions: {
      funcao: "Viga em flexão",
      geometria: "Seção livre, comprimento fixo",
      objetivo: "Minimizar massa",
      restricao: "Rigidez à flexão especificada",
      referencia: "Ashby, Material Selection in Mechanical Design",
    },
    dimension: "kilogram ** 0.5 / meter ** 0.5 / second",
    is_demo: true,
    ...overrides,
  };
}

const t = ptBR.indexCard;

describe("IndexCard", () => {
  it("states the conditions of validity without asking for a click", () => {
    render(<IndexCard index={describeIndex(makeIndex())} />);

    // §3.1 of the proposal: an index is only valid under the function, geometry,
    // objective and constraint it was derived from.
    expect(screen.getByText(t.assumptionFuncao)).toBeInTheDocument();
    expect(screen.getByText("Viga em flexão")).toBeInTheDocument();
    expect(screen.getByText("Seção livre, comprimento fixo")).toBeInTheDocument();
    expect(screen.getByText("Rigidez à flexão especificada")).toBeInTheDocument();
    expect(
      screen.getByText(/Ashby, Material Selection in Mechanical Design/),
    ).toBeInTheDocument();
    expect(screen.getByText(t.warning)).toBeInTheDocument();
  });

  it("shows every declared assumption, including one nobody translated", () => {
    const index = makeIndex({
      assumptions: { funcao: "Tirante", carga_axial: "Estática" },
    });
    render(<IndexCard index={describeIndex(index)} />);

    // A key the interface does not know about is data, not noise: hiding it
    // would make the card claim the index says less than it does.
    expect(screen.getByText("Carga axial")).toBeInTheDocument();
    expect(screen.getByText("Estática")).toBeInTheDocument();
  });

  it("says a custom expression has no declared hypotheses instead of inventing them", () => {
    render(<IndexCard index={describeCustomIndex("modulo_young / densidade", "maximize")} />);

    expect(screen.getByText(t.noAssumptions)).toBeInTheDocument();
    expect(screen.getByText(t.noAssumptionsHint)).toBeInTheDocument();
    expect(screen.queryByText(t.assumptionFuncao)).not.toBeInTheDocument();
  });

  it("prints the slope the backend computed, and the reason when there is none", () => {
    const { rerender } = render(
      <IndexCard
        index={describeIndex(makeIndex())}
        indexLine={{ available: true, orientation: "oblique", slope: 2, unavailableReason: null }}
      />,
    );
    expect(screen.getByText("2.000")).toBeInTheDocument();

    rerender(
      <IndexCard
        index={describeIndex(makeIndex())}
        indexLine={{
          available: false,
          orientation: null,
          slope: null,
          unavailableReason: "A expressão não usa nenhum dos dois eixos.",
        }}
      />,
    );
    expect(screen.getByText("A expressão não usa nenhum dos dois eixos.")).toBeInTheDocument();
    expect(screen.queryByText("2.000")).not.toBeInTheDocument();
  });
});

describe("IndexPicker", () => {
  it("shows the hypotheses of each option before the choice is made", () => {
    render(<IndexPicker indices={[makeIndex()]} value="none" onChange={() => {}} />);

    // The whole point of replacing the <select>: an <option> cannot say why an
    // index applies, so the reader had to choose first and find out later.
    expect(screen.getByText("Viga em flexão")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Viga leve/ })).not.toBeChecked();
  });

  it("reports the chosen slug", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IndexPicker indices={[makeIndex()]} value="none" onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: /Viga leve/ }));
    expect(onChange).toHaveBeenCalledWith("viga-leve-rigidez");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <IndexPicker indices={[makeIndex()]} value="viga-leve-rigidez" onChange={() => {}} />,
    );
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

const s = ptBR.selection;

function makeResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    initial_count: 10,
    combinator: "AND",
    final_count: 3,
    funnel: [
      { label: "Densidade ≤ 3", operator: "lte", passed: 6, remaining: 6 },
      { label: "Módulo ≥ 60", operator: "gte", passed: 3, remaining: 3 },
    ],
    candidates: [
      { material_id: 1, name: "Liga A", class_name: "Metais", index_value: 12, score: 0.9, rank: 1 },
      {
        material_id: 2,
        name: "Liga B",
        class_name: "Metais",
        index_value: null,
        score: 0.42,
        rank: 2,
      },
    ],
    index: {
      name: "Rigidez específica",
      expression: "modulo_young / densidade",
      goal: "maximize",
      dimension: "meter ** 2 / second ** 2",
      variables: ["modulo_young", "densidade"],
      values: [
        { material_id: 1, name: "Liga A", class_name: "Metais", value: 12, undefined_reason: null },
        {
          material_id: 2,
          name: "Liga B",
          class_name: "Metais",
          value: null,
          undefined_reason: "Sem valor para densidade",
        },
      ],
      defined_count: 1,
      undefined_count: 1,
    },
    ranking: null,
    ...overrides,
  };
}

describe("ResultsView", () => {
  it("shows how many candidates each stage eliminated", () => {
    render(<ResultsView result={makeResult()} />);

    const funnel = screen.getByRole("list");
    // 10 → 6 → 3: the two stages dropped 4 and 3.
    expect(within(funnel).getByText(`−4 ${s.eliminated}`)).toBeInTheDocument();
    expect(within(funnel).getByText(`−3 ${s.eliminated}`)).toBeInTheDocument();
  });

  it("names an undefined index value as absent, with the backend's reason", () => {
    render(<ResultsView result={makeResult()} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText(ptBR.quality.AUSENTE)).toBeInTheDocument();
    expect(within(table).getByText("Sem valor para densidade")).toBeInTheDocument();
    // The guarantee behind the badge: absence never becomes a number or a dash.
    expect(within(table).queryByText("0")).not.toBeInTheDocument();
    expect(within(table).queryByText("—")).not.toBeInTheDocument();
  });

  it("carries the limitation notice onto the screen that recommends", () => {
    render(<ResultsView result={makeResult()} />);

    // Item 5 of the proposal. Until now it only existed on exported files, so
    // the commitment held only for a reader who exported something.
    expect(screen.getByText(ptBR.limitation.full)).toBeInTheDocument();
  });

  it("breaks a score into its criteria in words, not only in colour", () => {
    const result = makeResult({
      ranking: {
        normalization: "minmax",
        criteria: ["densidade", "modulo_young"],
        ranked: [
          {
            material_id: 1,
            name: "Liga A",
            score: 0.9,
            rank: 1,
            contributions: [
              {
                key: "densidade",
                label: "Densidade",
                raw: 2.7,
                normalized: 0.8,
                weight: 0.5,
                contribution: 0.4,
              },
              {
                key: "modulo_young",
                label: "Módulo de Young",
                raw: 70,
                normalized: 1,
                weight: 0.5,
                contribution: 0.5,
              },
            ],
          },
        ],
        excluded: [],
        sensitivity: [],
      },
    });
    render(<ResultsView result={result} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("Densidade")).toBeInTheDocument();
    expect(within(table).getByText("0.400")).toBeInTheDocument();
    expect(within(table).getByText("Módulo de Young")).toBeInTheDocument();
    expect(within(table).getByText("0.500")).toBeInTheDocument();
  });
});
