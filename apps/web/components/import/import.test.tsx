import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ValidationReportView } from "./ValidationReportView";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { ValidationReport } from "@/lib/types";

const t = ptBR.importer;

function makeReport(overrides: Partial<ValidationReport> = {}): ValidationReport {
  return {
    job_id: 1,
    status: "VALIDADO",
    row_count: 3,
    valid_count: 1,
    error_count: 1,
    duplicate_count: 1,
    rows: [
      { row_number: 2, name: "Liga A", status: "ok", issues: [], warnings: [] },
      {
        row_number: 3,
        name: null,
        status: "error",
        issues: [{ column: "densidade", message: "Valor não numérico." }],
        warnings: [],
      },
      {
        row_number: 4,
        name: "Liga A",
        status: "duplicate",
        issues: [],
        warnings: ["Já existe um material com este nome."],
      },
    ],
    ...overrides,
  };
}

describe("ValidationReportView", () => {
  it("names the severity of each row in words, not only in colour", () => {
    render(<ValidationReportView report={makeReport()} />);

    const rows = screen.getAllByRole("row");
    // Row 0 is the header; the three data rows follow in file order.
    expect(within(rows[1] as HTMLElement).getByText(t.statusOk)).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText(t.statusError)).toBeInTheDocument();
    expect(within(rows[3] as HTMLElement).getByText(t.statusDuplicate)).toBeInTheDocument();
  });

  it("separates an error from a warning on the line that carries it", () => {
    render(<ValidationReportView report={makeReport()} />);

    const rows = screen.getAllByRole("row");
    const failing = within(rows[2] as HTMLElement);
    expect(failing.getByText(t.issueLabel)).toBeInTheDocument();
    expect(failing.getByText(/densidade: Valor não numérico/)).toBeInTheDocument();

    const duplicate = within(rows[3] as HTMLElement);
    expect(duplicate.getByText(t.warningLabel)).toBeInTheDocument();
    // An error stops the line from importing and a warning does not; the two
    // used to differ only by the colour of the text.
    expect(duplicate.queryByText(t.issueLabel)).not.toBeInTheDocument();
  });

  it("says a row has no name instead of printing a dash", () => {
    render(<ValidationReportView report={makeReport()} />);

    expect(screen.getByText(t.noName)).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("says a clean row is clean rather than leaving the cell blank", () => {
    render(<ValidationReportView report={makeReport()} />);

    expect(screen.getByText(t.rowOk)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ValidationReportView report={makeReport()} />);
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
