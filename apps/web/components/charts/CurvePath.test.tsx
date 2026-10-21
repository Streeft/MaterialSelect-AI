import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fichaText } from "@/lib/i18n-ficha";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { CurveChart } from "./CurveChart";
import { hysteresisLoop, stressStrain } from "./curveFixtures";

const tp = fichaText.path;

describe("CurveChart: the direction of a trajectory (TM4-i, D-118)", () => {
  it("draws the loop in the declared order, with the repeated x kept", () => {
    const { container } = render(<CurveChart curve={hysteresisLoop} />);
    const line = container.querySelector("[data-curve-line]")!;
    const points = line.getAttribute("points")!.split(" ");
    expect(points).toHaveLength(hysteresisLoop.series[0]!.path.length);
    // The two branches are two different y at the same x: both are in the line.
    const xs = points.map((p) => p.split(",")[0]);
    expect(new Set(xs).size).toBeLessThan(xs.length);
  });

  it("marks the way: arrowheads, a ring on the first point, a diamond on the last", () => {
    const { container } = render(<CurveChart curve={hysteresisLoop} />);
    expect(container.querySelectorAll("[data-curve-arrow]").length).toBeGreaterThan(0);
    const start = container.querySelector("[data-curve-start]")!;
    const end = container.querySelector("[data-curve-end]")!;
    const first = hysteresisLoop.series[0]!.path[0]!;
    // The ring sits on the line's first vertex, the diamond on its last.
    const [firstX, firstY] = container.querySelector("[data-curve-line]")!.getAttribute("points")!.split(" ")[0]!.split(",");
    expect(Number(start.getAttribute("cx"))).toBeCloseTo(Number(firstX), 0);
    expect(Number(start.getAttribute("cy"))).toBeCloseTo(Number(firstY), 0);
    expect(first).toEqual([0, 0]);
    expect(end.getAttribute("transform")).toMatch(/^translate\(/);
    // Direction is decoration for the eye: hidden from assistive technology.
    expect(container.querySelector("[data-curve-direction]")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("says the way in words: footer note, figure and series names, table header", () => {
    render(<CurveChart curve={hysteresisLoop} />);
    expect(screen.getByText(tp.direction, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: tp.figureLabel(hysteresisLoop.title) })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: new RegExp(tp.seriesOrder) })).toBeInTheDocument();
  });

  it("numbers the points in the table as the order of the path", async () => {
    render(<CurveChart curve={hysteresisLoop} />);
    await userEvent.click(screen.getByRole("button", { name: ptBR.chart.showTable }));
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: tp.columnOrder })).toBeInTheDocument();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(hysteresisLoop.series[0]!.points.length);
    expect(within(rows[0]!).getAllByRole("cell")[0]).toHaveTextContent("1");
    expect(within(rows[rows.length - 1]!).getAllByRole("cell")[0]).toHaveTextContent(String(rows.length));
  });

  it("draws no arrow, ring or diamond on an ordinary function curve", () => {
    const { container } = render(<CurveChart curve={stressStrain} />);
    expect(container.querySelector("[data-curve-direction]")).toBeNull();
    expect(container.querySelector("[data-curve-arrow]")).toBeNull();
    expect(screen.queryByText(tp.direction, { exact: false })).toBeNull();
    expect(screen.getByRole("figure", { name: ptBR.curves.figureLabel(stressStrain.title) })).toBeInTheDocument();
  });

  it("treats an answer without path_kind as a function (older responses)", () => {
    const { container } = render(<CurveChart curve={{ ...stressStrain, path_kind: undefined }} />);
    expect(container.querySelector("[data-curve-direction]")).toBeNull();
  });

  it("hides the direction with its series", async () => {
    const { container } = render(<CurveChart curve={hysteresisLoop} />);
    await userEvent.click(screen.getByRole("button", { name: /Ciclo 1/ }));
    expect(container.querySelector("[data-curve-arrow]")).toBeNull();
    expect(container.querySelector("[data-curve-start]")).toBeNull();
  });

  it("passes axe with the loop drawn", async () => {
    const { container } = render(<CurveChart curve={hysteresisLoop} />);
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
