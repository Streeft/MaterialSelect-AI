import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { CurveChart, axisTitle, dashArray, seriesName } from "./CurveChart";
import { stressStrain } from "./curveFixtures";
import type { Curve } from "@/lib/types";

const t = ptBR.curves;

describe("CurveChart (D-106)", () => {
  it("draws one line per series, the band, and axis titles with units", () => {
    const { container } = render(<CurveChart curve={stressStrain} />);
    expect(container.querySelectorAll("[data-curve-line]")).toHaveLength(2);
    // Only the second series declared a band.
    expect(container.querySelectorAll("[data-curve-band]")).toHaveLength(1);
    expect(screen.getAllByText("Deformação de engenharia (%)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tensão de engenharia (MPa)").length).toBeGreaterThan(0);
  });

  it("maps the backend's coordinates and never adds a point", () => {
    const { container } = render(<CurveChart curve={stressStrain} />);
    const line = container.querySelector("[data-curve-line]")!;
    expect(line.getAttribute("points")!.split(" ")).toHaveLength(3);
  });

  it("tells series apart by colour, dash and marker, with the parameter as legend", () => {
    render(<CurveChart curve={stressStrain} />);
    const legend = screen.getByRole("group", { name: ptBR.chart.legendToggle });
    expect(within(legend).getByRole("button", { name: /20 °C/ })).toBeInTheDocument();
    expect(within(legend).getByRole("button", { name: /300 °C/ })).toBeInTheDocument();
    expect(dashArray("solid")).toBeUndefined();
    expect(dashArray("dash")).toBe("7 4");
  });

  it("hides a series from the legend toggle", async () => {
    const { container } = render(<CurveChart curve={stressStrain} />);
    await userEvent.click(screen.getByRole("button", { name: /300 °C/ }));
    expect(container.querySelectorAll("[data-curve-line]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-curve-band]")).toHaveLength(0);
  });

  it("has the points table as its text alternative, with absence written out", async () => {
    render(<CurveChart curve={stressStrain} />);
    await userEvent.click(screen.getByRole("button", { name: ptBR.chart.showTable }));
    const table = screen.getByRole("table", { name: t.tableCaption(stressStrain.title) });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(1 + 6);
    // pt-BR numbers (D-30) and a written "no band", never a blank or 0 (D-24).
    expect(within(table).getAllByText("0,1").length).toBeGreaterThan(0);
    expect(within(table).getAllByText(t.noBand).length).toBe(4);
    expect(within(table).getByText("175 – 195")).toBeInTheDocument();
  });

  it("states provenance, conversion and the demo mark under the figure", () => {
    render(<CurveChart curve={stressStrain} />);
    expect(screen.getByText(t.source("Dataset Demo MaterialSelect"))).toBeInTheDocument();
    expect(screen.getByText(/pint:MPa->Pa/)).toBeInTheDocument();
    expect(screen.getByText(t.demo)).toBeInTheDocument();
  });

  it("writes the reason instead of an empty plot when nothing can be drawn", () => {
    const empty: Curve = {
      ...stressStrain,
      x_axis: { ...stressStrain.x_axis, domain: null },
      series: stressStrain.series.map((s) => ({ ...s, path: [], band: null })),
      notes: ["3 ponto(s) com valor menor ou igual a zero não aparecem em escala logarítmica."],
    };
    const { container } = render(<CurveChart curve={empty} />);
    expect(container.querySelector("svg[data-chart-figure]")).toBeNull();
    expect(screen.getAllByText(/não aparecem em escala logarítmica/).length).toBeGreaterThan(0);
  });

  it("labels a parameterless series and a pure-number axis honestly", () => {
    const bare: Curve = { ...stressStrain, parameter: null };
    expect(seriesName(bare, { ...stressStrain.series[0]!, parameter_value: null }, 2)).toBe(
      t.seriesFallback(3),
    );
    expect(axisTitle({ ...stressStrain.x_axis, title: null, quantity_label: "Número de ciclos", unit_label: "" })).toBe(
      "Número de ciclos",
    );
  });

  it("passes axe", async () => {
    const { container } = render(<CurveChart curve={stressStrain} />);
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
