import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button roles live
// inside a shadow root, invisible to plain @testing-library/react queries.
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { ChartToolbar } from "./ChartToolbar";
import { ComparisonView } from "./ComparisonView";
import { FigureData } from "./FigureData";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { CompareAxis, CompareCell, CompareMaterial, Comparison } from "@/lib/types";

// Plotly pulls WebGL and canvas into a runtime that has neither, and none of
// what it draws is under test here. Stubbing it also reproduces the reader's
// situation exactly: the figure is absent, and the page still has to work.
vi.mock("react-plotly.js", () => ({ default: () => null }));

const t = ptBR.chart;

/**
 * The toolbar is exercised without Plotly on purpose: the case worth pinning is
 * the one where there is no figure to export, and that is decided before the
 * library is ever loaded.
 */
describe("ChartToolbar", () => {
  it("says the export failed instead of doing nothing visible", async () => {
    const user = userEvent.setup();
    const target = createRef<HTMLDivElement>();
    render(
      <>
        <div ref={target} />
        <ChartToolbar target={target} fileName="mapa" />
      </>,
    );

    await user.click(await screen.findByShadowRole("button", { name: t.exportPng }));

    expect(await screen.findByShadowRole("alert")).toHaveTextContent(t.exportError);
  });

  it("offers both formats under one labelled group", async () => {
    const target = createRef<HTMLDivElement>();
    render(<ChartToolbar target={target} fileName="mapa" disabled />);

    const group = screen.getByShadowRole("group", { name: t.toolbar });
    expect(group).toBeInTheDocument();
    // Disabled while the figure is empty: a button that can only fail is worse
    // than no button.
    for (const name of [t.exportPng, t.exportSvg]) {
      expect(await screen.findByShadowRole("button", { name })).toBeDisabled();
    }
  });
});

interface Row {
  id: number;
  name: string;
  value: number | null;
}

const ROWS: Row[] = [
  { id: 1, name: "Aço 1020", value: 7.85 },
  { id: 2, name: "Alumina", value: null },
];

function renderFigureData() {
  return render(
    <FigureData
      caption="Densidade × módulo"
      rows={ROWS}
      rowKey={(row) => row.id}
      rowHeader={{ header: "Material", cell: (row) => row.name }}
      columns={[
        {
          key: "value",
          header: "Densidade",
          numeric: true,
          cell: (row) => (row.value === null ? null : String(row.value)),
        },
      ]}
    />,
  );
}

describe("FigureData", () => {
  it("hands the figure's numbers to a reader who cannot see the figure", async () => {
    const user = userEvent.setup();
    renderFigureData();

    // Closed by default, and one activation away — that is what "acessível a
    // partir da figura" has to mean for a keyboard reader.
    await user.click(screen.getByText(t.dataTable));

    const table = screen.getByShadowRole("table", { name: "Densidade × módulo" });
    expect(within(table).getByShadowRole("rowheader", { name: "Aço 1020" })).toBeInTheDocument();
    expect(within(table).getByText("7.85")).toBeInTheDocument();
  });

  it("renders a gap as absence, never as an empty cell", () => {
    renderFigureData();

    const row = screen.getByShadowRole("rowheader", { name: "Alumina" }).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText(ptBR.quality.AUSENTE)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderFigureData();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

function makeAxis(overrides: Partial<CompareAxis> = {}): CompareAxis {
  return {
    property_slug: "densidade",
    property_name: "Densidade",
    symbol: "ρ",
    unit: "kg/m**3",
    category: "FISICA",
    better_direction: "LOWER",
    allows_log_scale: true,
    min_value: 1000,
    max_value: 8000,
    present_count: 1,
    missing_material_ids: [2],
    ...overrides,
  };
}

function makeCell(overrides: Partial<CompareCell> = {}): CompareCell {
  return {
    property_slug: "densidade",
    is_missing: false,
    value: 7850,
    normalized: 0.75,
    value_min: null,
    value_max: null,
    original_value: 7.85,
    original_unit: "g/cm**3",
    conversion_method: "pint",
    uncertainty: null,
    data_quality: "MEDIDO",
    difference_pct: null,
    difference_state: "sem_referencia",
    source_label: "ASM",
    measurement_condition: null,
    ...overrides,
  };
}

function makeComparison(): Comparison {
  const materials: CompareMaterial[] = [
    {
      material_id: 1,
      name: "Aço 1020",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: true,
      cells: [makeCell()],
      complete: true,
    },
    {
      material_id: 2,
      name: "Alumina",
      class_name: "Cerâmicas",
      class_slug: "ceramicas",
      is_demo: true,
      // Nothing recorded: the bar chart draws no bar, and the data table must
      // say why rather than leaving the reader with a hole.
      cells: [makeCell({ is_missing: true, value: null, normalized: null })],
      complete: false,
    },
  ];
  return { normalization: "minmax", properties: [makeAxis()], materials, notes: [] };
}

/**
 * The comparator in a chart mode: Plotly never renders under jsdom (it is
 * dynamically imported with `ssr: false`), which is precisely the reader's
 * situation. What is left on the page has to be enough.
 */
describe("ComparisonView, chart modes", () => {
  it("carries the plotted numbers as a table", async () => {
    const user = userEvent.setup();
    render(<ComparisonView comparison={makeComparison()} mode="bars" />);

    await user.click(screen.getByText(t.dataTable));

    const caption = `${ptBR.compare.figure} — ${ptBR.compare.normalizedScale}`;
    const table = screen.getByShadowRole("table", { name: caption });
    expect(within(table).getByText("0,75")).toBeInTheDocument();
    // The material the figure could not plot is in the table all the same.
    const row = within(table).getByShadowRole("rowheader", { name: /Alumina/ }).closest("tr");
    expect(within(row as HTMLElement).getByText(ptBR.quality.AUSENTE)).toBeInTheDocument();
  });

  it("presents the figure as a single object, not as a wall of paths", () => {
    render(<ComparisonView comparison={makeComparison()} mode="radar" />);

    expect(
      screen.getByShadowRole("img", { name: t.figureLabel(ptBR.compare.figure) }),
    ).toBeInTheDocument();
  });
});

/**
 * The reference and the percentage difference (P2).
 *
 * The interesting half is everything that is *not* a number: five distinct
 * reasons a percentage can fail to exist, all identical as a blank cell and
 * none alike in meaning, so each renders its own sentence (D-24).
 */
describe("ComparisonView, referência e diferença percentual", () => {
  function withReference(cells: CompareCell[][]): Comparison {
    const base = makeComparison();
    return {
      ...base,
      materials: base.materials.map((material, index) => ({
        ...material,
        cells: cells[index] ?? material.cells,
      })),
    };
  }

  it("não mostra coluna de diferença quando ninguém é referência", () => {
    render(<ComparisonView comparison={makeComparison()} mode="table" />);

    expect(screen.queryByShadowText(ptBR.compare.differenceHeader)).not.toBeInTheDocument();
  });

  it("marca a linha de referência em vez de imprimir 0 %", () => {
    const comparison = withReference([
      [makeCell({ difference_state: "referencia" })],
      [makeCell({ difference_state: "calculada", difference_pct: 50 })],
    ]);

    render(<ComparisonView comparison={comparison} mode="table" referenceId={1} />);

    expect(screen.getAllByShadowText(ptBR.compare.reference).length).toBeGreaterThan(0);
  });

  it("imprime o percentual com sinal quando ele existe", () => {
    const comparison = withReference([
      [makeCell({ difference_state: "referencia" })],
      [makeCell({ difference_state: "calculada", difference_pct: 50 })],
    ]);

    render(<ComparisonView comparison={comparison} mode="table" referenceId={1} />);

    expect(screen.getByShadowText("+50%")).toBeInTheDocument();
  });

  it("escreve a razão quando a referência é que não tem o valor", () => {
    // Distinção que importa: a linha está boa, quem não responde é a
    // referência, e dizer o contrário mandaria o leitor consertar o registro
    // errado.
    const comparison = withReference([
      [makeCell({ difference_state: "referencia" })],
      [makeCell({ difference_state: "referencia_ausente" })],
    ]);

    render(<ComparisonView comparison={comparison} mode="table" referenceId={1} />);

    expect(
      screen.getByShadowText(ptBR.compare.difference.referencia_ausente),
    ).toBeInTheDocument();
  });

  it("escreve a razão quando a unidade não tem zero verdadeiro", () => {
    const comparison = withReference([
      [makeCell({ difference_state: "referencia" })],
      [makeCell({ difference_state: "escala_sem_zero" })],
    ]);

    render(<ComparisonView comparison={comparison} mode="table" referenceId={1} />);

    expect(
      screen.getByShadowText(ptBR.compare.difference.escala_sem_zero),
    ).toBeInTheDocument();
  });

  it("oferece definir como referência quando o chamador sabe recebê-la", async () => {
    const user = userEvent.setup();
    const onSetReference = vi.fn();

    render(
      <ComparisonView
        comparison={makeComparison()}
        mode="table"
        referenceId={null}
        onSetReference={onSetReference}
      />,
    );

    const buttons = await screen.findAllByShadowRole("button", {
      name: ptBR.compare.setReference,
    });
    await user.click(buttons[0]!);

    expect(onSetReference).toHaveBeenCalledWith(1);
  });
})
