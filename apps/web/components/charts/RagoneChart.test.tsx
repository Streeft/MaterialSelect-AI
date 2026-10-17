import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { RagoneResult } from "@/lib/types";
import { RagoneChart } from "./RagoneChart";

// Plotly is stubbed (no canvas in jsdom); the mock exposes the traces and the
// layout the component handed over, which is exactly what is under test.
vi.mock("react-plotly.js", () => ({
  default: (props: { data?: unknown[]; layout?: Record<string, unknown> }) => (
    <div
      data-testid="plotly-mock"
      data-traces={JSON.stringify(props.data ?? [])}
      data-layout={JSON.stringify(props.layout ?? {})}
    />
  ),
}));

const t = ptBR.battery.ragone;

const fixture: RagoneResult = {
  points: [
    {
      slug: "lfp",
      name: "LFP",
      specific_energy: 160,
      specific_power: 1500,
      citation: "Linden's Handbook of Batteries (4ª ed.)",
      source: "Literatura de baterias (compilação)",
    },
    {
      slug: "nmc",
      name: "NMC",
      specific_energy: 250,
      specific_power: 1000,
      citation: null,
      source: null,
    },
  ],
  x_axis: {
    key: "specific_energy",
    label: "Energia específica da célula",
    unit: "Wh/kg",
    scale: "log",
    min_value: 80,
    max_value: 500,
  },
  y_axis: {
    key: "specific_power",
    label: "Potência específica da célula (base não declarada)",
    unit: "W/kg",
    scale: "log",
    min_value: 500,
    max_value: 3000,
  },
  // E = P·t: at t = 0,1 h, 100 Wh/kg is 1000 W/kg and 300 is 3000.
  iso_time: [
    {
      hours: 0.1,
      label: "0,1 h",
      points: [
        { x: 80, y: 800 },
        { x: 300, y: 3000 },
      ],
    },
  ],
  excluded: [
    {
      slug: "xx",
      name: "Química X",
      reason: "Fora do gráfico: sem potência específica positiva no catálogo.",
    },
  ],
  power_basis_note: "A potência específica é da célula e a base (pico ou contínua) não está declarada.",
};

function traces(): { x: number[]; y: number[]; mode: string; name?: string }[] {
  return JSON.parse(screen.getByTestId("plotly-mock").getAttribute("data-traces") ?? "[]");
}

describe("RagoneChart (D-143)", () => {
  it("passes axe and names the figure for assistive technology", async () => {
    const { container } = render(<RagoneChart data={fixture} />);
    expect(screen.getByRole("img", { name: ptBR.chart.figureLabel(t.figure) })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: new RegExp(t.title) })).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("draws log–log axes with the cell and the undeclared power basis in the title", () => {
    render(<RagoneChart data={fixture} />);
    const layout = JSON.parse(screen.getByTestId("plotly-mock").getAttribute("data-layout")!);
    expect(layout.xaxis.type).toBe("log");
    expect(layout.yaxis.type).toBe("log");
    expect(layout.yaxis.title.text).toMatch(/da célula/);
    expect(layout.yaxis.title.text).toMatch(/base não declarada/);
    // The box is the backend's, in decades.
    expect(layout.xaxis.range[0]).toBeCloseTo(Math.log10(80));
    expect(screen.getByText(fixture.power_basis_note)).toBeInTheDocument();
  });

  it("passes the iso-time line through as a straight line of slope 1 in log–log (E = P·t)", () => {
    render(<RagoneChart data={fixture} />);
    const line = traces().find((trace) => trace.mode === "lines")!;
    expect(line.x).toEqual([80, 300]);
    expect(line.y).toEqual([800, 3000]);
    const slope = (Math.log10(line.y[1]!) - Math.log10(line.y[0]!)) / (Math.log10(line.x[1]!) - Math.log10(line.x[0]!));
    expect(slope).toBeCloseTo(1, 9);
    for (const [i, x] of line.x.entries()) expect(x).toBeCloseTo(line.y[i]! * 0.1, 9);
  });

  it("plots exactly the catalogue's points, never adding one", () => {
    render(<RagoneChart data={fixture} />);
    const points = traces().find((trace) => trace.mode === "text+markers")!;
    expect(points.x).toEqual([160, 250]);
    expect(points.y).toEqual([1500, 1000]);
  });

  it("offers the source table with written absence and the citation as stored", async () => {
    render(<RagoneChart data={fixture} />);
    await userEvent.click(screen.getByRole("button", { name: /tabela/i }));
    const table = screen.getByRole("table", { name: t.tableCaption });
    expect(table).toHaveTextContent("Linden's Handbook of Batteries (4ª ed.)");
    // NMC has neither citation nor source: the cell says so, in words.
    expect(table).toHaveTextContent(t.noSource);
    expect(table).toHaveTextContent("160");
    expect(table).toHaveTextContent("1.500");
  });

  it("writes the reason for a chemistry left out instead of plotting zero", () => {
    render(<RagoneChart data={fixture} />);
    expect(screen.getByText(t.excludedTitle)).toBeInTheDocument();
    expect(screen.getByText(/sem potência específica positiva/)).toBeInTheDocument();
    expect(traces().find((trace) => trace.mode === "text+markers")!.x).not.toContain(0);
  });

  it("shows the written empty state when no chemistry can be drawn", () => {
    render(
      <RagoneChart
        data={{ ...fixture, points: [], x_axis: null, y_axis: null, iso_time: [] }}
      />,
    );
    expect(screen.getByText(t.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("plotly-mock")).not.toBeInTheDocument();
    expect(screen.getByText(/sem potência específica positiva/)).toBeInTheDocument();
  });
});
