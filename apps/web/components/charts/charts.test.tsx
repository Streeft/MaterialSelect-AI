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
import { AshbyMap } from "./AshbyMap";
import { ChartFrame } from "./ChartFrame";
import { HorizontalBars } from "./HorizontalBars";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { CompareAxis, CompareCell, CompareMaterial, Comparison, PropertyMap } from "@/lib/types";

// Plotly pulls WebGL and canvas into a runtime that has neither, and none of
// what it draws is under test here. Stubbing it also reproduces the reader's
// situation exactly: the figure is absent, and the page still has to work.
vi.mock("react-plotly.js", () => ({
  default: (props: {
    data?: { name?: string; visible?: boolean }[];
    layout?: { dragmode?: string; shapes?: unknown[]; showlegend?: boolean };
    onSelected?: (event: unknown) => void;
  }) => (
    <div
      data-testid="plotly-mock"
      data-dragmode={props.layout?.dragmode}
      data-shapes={JSON.stringify(props.layout?.shapes ?? [])}
      data-showlegend={String(props.layout?.showlegend)}
      data-hidden-traces={JSON.stringify(
        (props.data ?? []).filter((trace) => trace.visible === false).map((trace) => trace.name),
      )}
    >
      <button
        type="button"
        data-testid="simulate-selection"
        onClick={() =>
          props.onSelected?.({
            range: {
              x: [2000, 8000],
              y: [50, 300],
            },
          })
        }
      >
        Simulate Select
      </button>
      <button
        type="button"
        data-testid="simulate-clear"
        onClick={() => props.onSelected?.(null)}
      >
        Simulate Clear
      </button>
      {/* What Plotly's reselect pass emits on every Plotly.react: an event
          object with points and no range. Not a clear. */}
      <button
        type="button"
        data-testid="simulate-reselect"
        onClick={() => props.onSelected?.({ points: [] })}
      >
        Simulate Reselect
      </button>
    </div>
  ),
}));

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

    await user.click(await screen.findByShadowRole("button", { name: t.exportMenu }));
    await user.click(await screen.findByShadowRole("menuitem", { name: new RegExp(`^${t.exportPng}`) }));

    expect(await screen.findByShadowRole("alert")).toHaveTextContent(t.exportError);
  });

  it("offers both formats in one Exportar menu (D-91)", async () => {
    const user = userEvent.setup();
    const target = createRef<HTMLDivElement>();
    render(<ChartToolbar target={target} fileName="mapa" />);

    expect(screen.getByShadowRole("group", { name: t.toolbar })).toBeInTheDocument();
    const trigger = screen.getByShadowRole("button", { name: t.exportMenu });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    const menu = await screen.findByShadowRole("menu", { name: t.exportMenu });
    const items = within(menu).getAllByShadowRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      `${t.exportPng}${t.exportPngHint}`,
      `${t.exportSvg}${t.exportSvgHint}`,
    ]);
    // Opening lands the keyboard inside the list; Escape gives focus back.
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByShadowRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    // Tab leaves from the trigger, not from the end of <body> where the
    // portalled list lives: Shift+Tab out of the list lands back on it.
    await user.click(trigger);
    await screen.findByShadowRole("menu");
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.queryByShadowRole("menu")).not.toBeInTheDocument();
  });

  it("disables the menu while there is no figure to export", () => {
    const target = createRef<HTMLDivElement>();
    render(<ChartToolbar target={target} fileName="mapa" disabled />);
    // A button that can only fail is worse than no button.
    expect(screen.getByShadowRole("button", { name: t.exportMenu })).toBeDisabled();
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
  it("hands the figure's numbers to a reader who cannot see the figure", () => {
    // Only the table: since D-80 the chart card's "Ver tabela de dados" toggle
    // shows it in place of the figure (see ChartFrame below).
    renderFigureData();

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
    display_unit: null,
    display_value: null,
    display_min: null,
    display_max: null,
    display_uncertainty: null,
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

/** Three properties, so the radar has a figure to draw; Alumina lacks one. */
function makeWideComparison(): Comparison {
  const slugs = ["densidade", "modulo-young", "custo"] as const;
  const properties = slugs.map((slug, i) =>
    makeAxis({
      property_slug: slug,
      property_name: ["Densidade", "Módulo de Young", "Custo"][i] ?? slug,
      symbol: ["ρ", "E", "C"][i] ?? null,
      missing_material_ids: slug === "custo" ? [2] : [],
    }),
  );
  const materials: CompareMaterial[] = [
    {
      material_id: 1,
      name: "Aço 1020",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: true,
      cells: slugs.map((slug, i) => makeCell({ property_slug: slug, normalized: [0.75, 1, 0][i] ?? 0 })),
      complete: true,
    },
    {
      material_id: 2,
      name: "Alumina",
      class_name: "Cerâmicas",
      class_slug: "ceramicas",
      is_demo: true,
      cells: slugs.map((slug, i) =>
        slug === "custo"
          ? makeCell({ property_slug: slug, is_missing: true, value: null, normalized: null })
          : makeCell({ property_slug: slug, normalized: [0.25, 0.5][i] ?? 0 }),
      ),
      complete: false,
    },
  ];
  return { normalization: "minmax", properties, materials, notes: [] };
}

/**
 * The comparator in a chart mode (D-80): the four figures are the app's own
 * MSDS SVG, so under jsdom they render for real — marks, legend and all.
 */
describe("ComparisonView, chart modes", () => {
  it("carries the plotted numbers as a table, one toggle away", async () => {
    const user = userEvent.setup();
    render(<ComparisonView comparison={makeComparison()} mode="bars" />);

    const caption = `${ptBR.compare.figure} — ${ptBR.compare.normalizedScale}`;
    // Hidden while the figure shows — and never absent from the page.
    expect(screen.queryByShadowRole("table", { name: caption })).not.toBeInTheDocument();
    await user.click(screen.getByShadowRole("button", { name: t.showTable }));

    const table = screen.getByShadowRole("table", { name: caption });
    expect(within(table).getByText("0,75")).toBeInTheDocument();
    // The material the figure could not plot is in the table all the same.
    const row = within(table).getByShadowRole("rowheader", { name: /Alumina/ }).closest("tr");
    expect(within(row as HTMLElement).getByText(ptBR.quality.AUSENTE)).toBeInTheDocument();
    // And the way back is the other position of the same switch (D-91).
    expect(screen.getByShadowRole("button", { name: t.showFigure })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByShadowRole("button", { name: t.showTable })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("presents the figure as one named figure", () => {
    render(<ComparisonView comparison={makeComparison()} mode="bars" />);

    expect(
      screen.getByShadowRole("figure", { name: t.figureLabel(ptBR.compare.figure) }),
    ).toBeInTheDocument();
  });

  it("writes a missing score as absence in the bars, never as a short bar (D-24)", () => {
    render(<ComparisonView comparison={makeComparison()} mode="bars" />);

    expect(
      screen.getByShadowRole("img", { name: new RegExp(`Alumina.*${ptBR.quality.AUSENTE}`) }),
    ).toBeInTheDocument();
    expect(screen.getByShadowRole("img", { name: /Aço 1020.*0,75/ })).toBeInTheDocument();
  });

  it("keeps a whole figure to one tab stop, and walks its marks with the arrows", async () => {
    const user = userEvent.setup();
    render(<ComparisonView comparison={makeWideComparison()} mode="bars" />);

    const figure = screen.getByShadowRole("figure", { name: t.figureLabel(ptBR.compare.figure) });
    const marks = within(figure).getAllByShadowRole("img");
    expect(marks.filter((mark) => mark.getAttribute("tabindex") === "0")).toHaveLength(1);

    const first = marks[0] as HTMLElement;
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(marks[1]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(marks[marks.length - 1]);
  });

  it("draws only complete materials on the radar, and lists the rest", () => {
    render(<ComparisonView comparison={makeWideComparison()} mode="radar" />);

    expect(screen.getByText(new RegExp(ptBR.compare.radarSkipsMissing.slice(0, 30)))).toHaveTextContent(
      "Alumina",
    );
    const legend = screen.getByShadowRole("group", { name: t.legendToggle });
    expect(within(legend).getByShadowRole("button", { name: "Aço 1020" })).toBeInTheDocument();
    expect(within(legend).queryByShadowRole("button", { name: "Alumina" })).not.toBeInTheDocument();
    // No vertex of the incomplete material, so no invented zero on its gap.
    expect(screen.queryByShadowRole("img", { name: /Alumina/ })).not.toBeInTheDocument();
  });

  it("hides and restores a series from the legend", async () => {
    const user = userEvent.setup();
    render(<ComparisonView comparison={makeWideComparison()} mode="parallel" />);

    const button = screen.getByShadowRole("button", { name: "Alumina" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByShadowRole("img", { name: /Alumina/ }).length).toBeGreaterThan(0);

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByShadowRole("img", { name: /Alumina/ })).not.toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("says under the axis how many materials the parallel line skips", () => {
    render(<ComparisonView comparison={makeWideComparison()} mode="parallel" />);

    expect(screen.getByText(t.missingOnAxis(1))).toBeInTheDocument();
  });

  it("names a missing heatmap cell, and the scale names the absence", () => {
    render(<ComparisonView comparison={makeWideComparison()} mode="heatmap" />);

    expect(
      screen.getByShadowRole("img", { name: new RegExp(`Alumina.*Custo: ${ptBR.quality.AUSENTE}`) }),
    ).toBeInTheDocument();
    const figure = screen.getByShadowRole("figure", { name: t.figureLabel(ptBR.compare.figure) });
    // The written legend entry beside the ramp — absence is never an empty square.
    expect(within(figure).getAllByText(ptBR.quality.AUSENTE).length).toBeGreaterThan(0);
  });

  it("has no accessibility violations in any chart mode", async () => {
    for (const mode of ["bars", "radar", "parallel", "heatmap"] as const) {
      const { container, unmount } = render(
        <ComparisonView comparison={makeWideComparison()} mode={mode} />,
      );
      const violations = await findA11yViolations(container);
      expect(violations, `${mode}: ${describeViolations(violations)}`).toHaveLength(0);
      unmount();
    }
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
});

function makePropertyMap(): PropertyMap {
  return {
    scale: "linear",
    x_axis: {
      is_index: false,
      property_slug: "densidade",
      property_name: "Densidade",
      expression: null,
      symbol: "ρ",
      unit: "kg/m**3",
      category: "FISICA",
      better_direction: "LOWER",
      allows_log_scale: true,
      min_value: null,
      max_value: null,
    },
    y_axis: {
      is_index: false,
      property_slug: "modulo-young",
      property_name: "Módulo de Young",
      expression: null,
      symbol: "E",
      unit: "GPa",
      category: "MECANICA",
      better_direction: "HIGHER",
      allows_log_scale: true,
      min_value: null,
      max_value: null,
    },
    points: [
      {
        material_id: 1,
        material_name: "Aço 1020",
        class_slug: "metais",
        class_name: "Metais",
        is_demo: true,
        x: 7850,
        y: 210,
        x_min: null,
        x_max: null,
        y_min: null,
        y_max: null,
        x_uncertainty: null,
        y_uncertainty: null,
        x_is_interval: false,
        y_is_interval: false,
        x_quality: "MEDIDO",
        y_quality: "MEDIDO",
        index_value: null,
        index_undefined_reason: null,
      },
    ],
    envelopes: [],
    envelopes_alt: [],
    index: null,
    notes: [],
    excluded: [],
    plotted_count: 1,
    considered_count: 1,
  };
}

describe("AshbyMap — seleção interativa e cursor", () => {
  it("não renderiza seletor de cursor quando enableBoxSelect é falso ou omitido", () => {
    render(<AshbyMap map={makePropertyMap()} />);
    // The "Gráfico | Tabela" switch is segmented too (D-91); the cursor one is
    // found by its name.
    expect(screen.queryByRole("group", { name: ptBR.chart.dragMode })).toBeNull();
  });

  it("renderiza o alternador de cursor entre zoom e seleção quando enableBoxSelect está ativo", () => {
    render(<AshbyMap map={makePropertyMap()} enableBoxSelect />);
    const set = screen.getByRole("group", { name: ptBR.chart.dragMode });
    expect(within(set).getAllByRole("button")).toHaveLength(2);
  });

  it("passa a caixa de seleção configurada como shape retangular no layout do Plotly", async () => {
    render(
      <AshbyMap
        map={makePropertyMap()}
        enableBoxSelect
        selectionBox={{ xMin: 2000, xMax: 8000, yMin: 50, yMax: 300 }}
      />,
    );

    const mockPlotly = await screen.findByTestId("plotly-mock");
    const shapes = JSON.parse(mockPlotly.getAttribute("data-shapes") ?? "[]") as Array<{
      type?: string;
      x0?: number;
      x1?: number;
      y0?: number;
      y1?: number;
    }>;
    expect(shapes.length).toBeGreaterThan(0);
    const boxShape = shapes.find((s) => s.type === "rect");
    expect(boxShape).toBeDefined();
    expect(boxShape?.x0).toBe(2000);
    expect(boxShape?.x1).toBe(8000);
    expect(boxShape?.y0).toBe(50);
    expect(boxShape?.y1).toBe(300);
  });

  it("dispara onSelectBox ao simular evento onSelected com coordenadas lineares", async () => {
    const user = userEvent.setup();
    const onSelectBox = vi.fn();

    render(
      <AshbyMap
        map={makePropertyMap()}
        displayScale="linear"
        enableBoxSelect
        onSelectBox={onSelectBox}
      />,
    );

    const selectBtn = await screen.findByTestId("simulate-selection");
    await user.click(selectBtn);

    expect(onSelectBox).toHaveBeenCalledWith({
      xMin: 2000,
      xMax: 8000,
      yMin: 50,
      yMax: 300,
    });
  });

  it("dispara onSelectBox com null ao limpar seleção", async () => {
    const user = userEvent.setup();
    const onSelectBox = vi.fn();

    render(
      <AshbyMap
        map={makePropertyMap()}
        displayScale="linear"
        enableBoxSelect
        onSelectBox={onSelectBox}
      />,
    );

    const clearBtn = await screen.findByTestId("simulate-clear");
    await user.click(clearBtn);

    expect(onSelectBox).toHaveBeenCalledWith(null);
  });

  it("lê a caixa num eixo log em unidades de dado, sem elevar 10 ao valor", async () => {
    // Plotly reports a log-axis box in data units (selections/helpers.js:
    // p2r → ax.p2d). 10^2000 would be Infinity.
    const user = userEvent.setup();
    const onSelectBox = vi.fn();
    render(
      <AshbyMap map={makePropertyMap()} displayScale="log" enableBoxSelect onSelectBox={onSelectBox} />,
    );

    await user.click(await screen.findByTestId("simulate-selection"));

    expect(onSelectBox).toHaveBeenCalledWith({ xMin: 2000, xMax: 8000, yMin: 50, yMax: 300 });
  });

  it("não apaga a região quando o Plotly reemite a seleção num re-render", async () => {
    const user = userEvent.setup();
    const onSelectBox = vi.fn();
    render(
      <AshbyMap map={makePropertyMap()} displayScale="linear" enableBoxSelect onSelectBox={onSelectBox} />,
    );

    await user.click(await screen.findByTestId("simulate-reselect"));

    expect(onSelectBox).not.toHaveBeenCalled();
  });

  it("permite customizar o rótulo da coluna de registro na tabela via recordLabel", async () => {
    const user = userEvent.setup();
    render(<AshbyMap map={makePropertyMap()} recordLabel="Processo" />);
    await user.click(screen.getByShadowRole("button", { name: t.showTable }));
    expect(screen.getByShadowRole("columnheader", { name: "Processo" })).toBeInTheDocument();
  });

  it("troca a legenda do Plotly pelos botões MSDS, que ocultam a classe sem mexer na seleção", async () => {
    const user = userEvent.setup();
    const onSelectBox = vi.fn();
    render(<AshbyMap map={makePropertyMap()} enableBoxSelect onSelectBox={onSelectBox} />);

    const mock = await screen.findByTestId("plotly-mock");
    expect(mock).toHaveAttribute("data-showlegend", "false");

    const legend = screen.getByShadowRole("group", { name: t.legendToggle });
    const metals = within(legend).getByShadowRole("button", { name: "Metais" });
    expect(metals).toHaveAttribute("aria-pressed", "true");

    await user.click(metals);

    expect(metals).toHaveAttribute("aria-pressed", "false");
    expect(JSON.parse(mock.getAttribute("data-hidden-traces") ?? "[]")).toContain("Metais");
    // Hiding a class is a view choice, not a region: the selection is untouched.
    expect(onSelectBox).not.toHaveBeenCalled();
  });
});

/**
 * D-94: the AI Studio chart behaviour — a readout that lists every series of
 * the category under the pointer, and a corner switch between two drawings of
 * the same rows.
 */
describe("HorizontalBars — tooltip and orientation (D-94)", () => {
  const segments = [
    { key: "a", label: "Preenchido", color: "rgb(0 0 0)" },
    { key: "b", label: "Ausente", color: "rgb(1 1 1)" },
  ];
  const rows = [
    { key: "metais", label: "Metais", values: { a: 7, b: 2 }, valueLabel: "77,8%" },
    { key: "polimeros", label: "Polímeros", values: { a: 3, b: 0 }, valueLabel: "100,0%" },
  ];
  const describe_ = (row: { label: string }, segment: { label: string }) => ({
    aria: `${row.label}: ${segment.label}`,
  });

  for (const orientation of ["horizontal", "vertical"] as const) {
    it(`lists every segment of the hovered category (${orientation})`, async () => {
      const user = userEvent.setup();
      const { container } = render(
        <HorizontalBars
          figureLabel="Cobertura"
          segments={segments}
          rows={rows}
          orientation={orientation}
          describe={describe_}
        />,
      );
      const tooltip = container.querySelector(".chart-tooltip") as HTMLElement;
      expect(tooltip.textContent).toBe("");

      await user.hover(screen.getByShadowRole("img", { name: "Metais: Ausente" }));
      expect(tooltip).toHaveTextContent("Metais");
      expect(tooltip).toHaveTextContent("Preenchido7");
      expect(tooltip).toHaveTextContent("Ausente2");
      expect(tooltip).toHaveTextContent("77,8%");
      // The segment under the pointer is the emphasised row.
      const emphasised = tooltip.querySelector('[data-emphasis="true"]');
      expect(emphasised).toHaveTextContent("Ausente");
    });
  }

  it("keeps one keyboard mark per segment in both orientations", () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      const { unmount } = render(
        <HorizontalBars
          figureLabel="Cobertura"
          segments={segments}
          rows={rows}
          orientation={orientation}
          describe={describe_}
        />,
      );
      // Polímeros has no "Ausente": a zero is not drawn as a mark.
      expect(screen.getAllByShadowRole("img")).toHaveLength(3);
      unmount();
    }
  });
});

describe("ChartFrame — chart-type switch (D-94)", () => {
  it("offers each drawing as a round button, and the table beside them", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    render(
      <ChartFrame
        title="Cobertura por classe"
        exportName="painel"
        views={[
          { key: "vertical", label: t.viewColumns, icon: null },
          { key: "horizontal", label: t.viewBars, icon: null },
        ]}
        view="vertical"
        onViewChange={onViewChange}
        table={<p>tabela</p>}
      >
        <svg data-chart-figure />
      </ChartFrame>,
    );

    const group = screen.getByShadowRole("group", { name: t.view });
    const columns = within(group).getByShadowRole("button", { name: t.viewColumns });
    const bars = within(group).getByShadowRole("button", { name: t.viewBars });
    expect(columns).toHaveAttribute("aria-pressed", "true");
    expect(bars).toHaveAttribute("aria-pressed", "false");

    await user.click(bars);
    expect(onViewChange).toHaveBeenCalledWith("horizontal");

    // The table is a third seat of the same switch; leaving it goes back to
    // the drawing that was chosen.
    await user.click(within(group).getByShadowRole("button", { name: t.showTable }));
    expect(columns).toHaveAttribute("aria-pressed", "false");
    await user.click(columns);
    expect(columns).toHaveAttribute("aria-pressed", "true");
  });
});
