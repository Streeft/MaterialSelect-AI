import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { SweepChart } from "./SweepChart";
import { emptySweep, pairSweep, scalarSweep } from "./sweepFixtures";

const t = ptBR.synthesis.sweep;

describe("SweepChart (D-144)", () => {
  it("passes axe and names the figure for assistive technology", async () => {
    const { container } = render(<SweepChart data={scalarSweep} />);
    expect(
      screen.getByRole("figure", {
        name: t.chart.figureLabel("Leveza sob flexão", scalarSweep.variable_label),
      }),
    ).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("shows the API's note that absolute thickness does not change the ranking", () => {
    render(<SweepChart data={scalarSweep} />);
    expect(screen.getByText(scalarSweep.note)).toBeInTheDocument();
  });

  it("breaks the line at a skipped step instead of bridging or zeroing it", () => {
    const { container } = render(<SweepChart data={scalarSweep} />);
    // Positions 0-1 and 3-4: two runs, and a point per calculated step only.
    expect(container.querySelectorAll("[data-sweep-line]")).toHaveLength(2);
    expect(container.querySelectorAll("[data-sweep-point]")).toHaveLength(4);
  });

  it("lists the skipped step with its written reason", () => {
    render(<SweepChart data={scalarSweep} />);
    expect(screen.getByText(t.chart.skippedTitle)).toBeInTheDocument();
    expect(screen.getAllByText(/O constituinte não tem o dado necessário/).length).toBeGreaterThan(0);
  });

  it("offers the source table with the skipped step marked, never blank or zero", async () => {
    render(<SweepChart data={scalarSweep} />);
    await userEvent.click(screen.getByRole("button", { name: /tabela/i }));
    const table = screen.getByRole("table", { name: t.chart.tableCaption("Leveza sob flexão") });
    expect(table).toHaveTextContent("2,5");
    expect(table).toHaveTextContent(t.chart.withoutIndex("O constituinte não tem o dado necessário."));
    // The skipped row's index cell says the value is absent, in words.
    // Header row, then positions 1, 2 and 3 (the skipped one) in grid order.
    const skippedRow = within(table).getAllByRole("row")[3]!;
    expect(skippedRow).toHaveTextContent(ptBR.quality.AUSENTE);
    expect(skippedRow).not.toHaveTextContent(/\b0\b/);
  });

  it("draws the Reuss–Voigt pair as a band and prints both limits, never a mean", async () => {
    const { container } = render(<SweepChart data={pairSweep} />);
    expect(container.querySelectorAll("[data-sweep-band]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-sweep-line]")).toHaveLength(0);
    expect(screen.getByText(t.chart.band)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /tabela/i }));
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("12 – 30");
    // Midpoints would be 15, 21 and 27: no cell may carry one.
    const cells = within(table).getAllByRole("cell").map((cell) => cell.textContent);
    for (const mean of ["15", "21", "27"]) expect(cells).not.toContain(mean);
  });

  it("writes the empty state and every reason when no step has an index", () => {
    const { container } = render(<SweepChart data={emptySweep} />);
    expect(screen.getByText(t.emptyTitle)).toBeInTheDocument();
    expect(container.querySelector("svg[data-chart-figure]")).toBeNull();
    expect(screen.getAllByText(/competição entre modos de falha/)).toHaveLength(3);
  });
});
