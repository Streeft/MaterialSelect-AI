import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CompositionEntry, CompositionSearchReport, Designation } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { compositionContent, compositionOriginal } from "@/lib/composition";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { CompositionTable } from "./CompositionTable";
import { DesignationTable } from "./DesignationTable";
import { CompositionReport } from "@/components/catalog/CompositionReport";
import { SearchHelp } from "@/components/catalog/SearchHelp";

const t = ptBR.detail;

function row(overrides: Partial<CompositionEntry>): CompositionEntry {
  return {
    element: "Cr",
    element_name: "Cromo",
    atomic_number: 24,
    state: "faixa",
    value_min: null,
    value_max: null,
    value_nominal: null,
    original_unit: "%",
    normalized_min: null,
    normalized_max: null,
    normalized_nominal: null,
    canonical_unit: "percent",
    conversion_method: "identity:percent",
    notes: null,
    data_quality: "IMPORTADO",
    source_label: "Fonte",
    citation: null,
    is_demo: false,
    ...overrides,
  };
}

describe("composição em palavras (D-105)", () => {
  it("writes each declared shape without inventing the missing bound", () => {
    expect(compositionContent(row({ normalized_min: 17.5, normalized_max: 19.5 }))).toBe(
      "17,5 % a 19,5 %",
    );
    // "≤ 0,07" has no minimum, and the sheet must not print "0 a 0,07".
    expect(compositionContent(row({ normalized_max: 0.07 }))).toBe("até 0,07 %");
    expect(compositionContent(row({ normalized_min: 99.9 }))).toBe("a partir de 99,9 %");
    expect(compositionContent(row({ normalized_nominal: 1 }))).toBe("1 % (nominal)");
    expect(
      compositionContent(row({ normalized_min: 0.8, normalized_max: 1.2, normalized_nominal: 1 })),
    ).toBe("0,8 % a 1,2 % · nominal 1 %");
  });

  it("never turns the balance or an absent content into a number", () => {
    expect(compositionContent(row({ state: "resto" }))).toBe(t.contentBalance);
    expect(compositionContent(row({ state: "ausente" }))).toBe(t.contentAbsent);
    expect(compositionOriginal(row({ state: "resto" }))).toBeNull();
  });

  it("keeps what the source wrote, in its own unit", () => {
    expect(compositionOriginal(row({ value_max: 1500, original_unit: "ppm" }))).toBe(
      "até 1.500 ppm",
    );
  });
});

describe("CompositionTable", () => {
  it("says, in words, that no composition is registered", () => {
    render(<CompositionTable entries={[]} materialIsDemo={false} />);
    expect(screen.getByText(t.noComposition)).toBeInTheDocument();
    expect(screen.getByText(t.noCompositionHint)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lists every state with its source, and passes axe", async () => {
    const { container } = render(
      <CompositionTable
        materialIsDemo={false}
        entries={[
          row({ normalized_min: 17.5, normalized_max: 19.5, value_min: 17.5, value_max: 19.5 }),
          row({
            element: "Ti",
            element_name: "Titânio",
            normalized_max: 0.15,
            value_max: 1500,
            original_unit: "ppm",
            conversion_method: "pint:ppm->percent",
            citation: "Tabela 2",
          }),
          row({ element: "Mo", element_name: "Molibdênio", state: "ausente", original_unit: null }),
          row({ element: "Fe", element_name: "Ferro", state: "resto", is_demo: true }),
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: t.compositionCaption });
    // Mass percent, and what the source wrote — here the same unit.
    expect(within(table).getAllByText("17,5 % a 19,5 %")).toHaveLength(2);
    expect(within(table).getByText("até 1.500 ppm")).toBeInTheDocument();
    expect(within(table).getByText(t.conversion("pint:ppm->percent"))).toBeInTheDocument();
    expect(within(table).getByText(t.contentAbsent)).toBeInTheDocument();
    expect(within(table).getByText(t.contentBalance)).toBeInTheDocument();
    expect(within(table).getByText("Tabela 2")).toBeInTheDocument();
    // A fictitious row on a real material says so.
    expect(within(table).getByText(t.demoRow)).toBeInTheDocument();
    // No dash and no zero stand in for absence.
    expect(within(table).queryByText("—")).not.toBeInTheDocument();
    expect(within(table).queryByText("0")).not.toBeInTheDocument();

    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

const designation: Designation = {
  system: "AISI_SAE",
  system_label: "AISI/SAE",
  code: "DEMO-304",
  region: null,
  source_label: "Dataset Demo MaterialSelect",
  citation: "Tabela fictícia",
  is_demo: true,
};

describe("DesignationTable", () => {
  it("states that none is registered", () => {
    render(<DesignationTable designations={[]} materialIsDemo={false} />);
    expect(screen.getByText(t.noDesignations)).toBeInTheDocument();
  });

  it("shows system, code, region and source, and passes axe", async () => {
    const { container } = render(
      <DesignationTable
        designations={[designation, { ...designation, system: "EN", system_label: "EN", code: "DEMO-1.4001", region: "Europa" }]}
        materialIsDemo
      />,
    );
    const table = screen.getByRole("table", { name: t.designationsCaption });
    expect(within(table).getByText("AISI/SAE")).toBeInTheDocument();
    expect(within(table).getByText("DEMO-304")).toBeInTheDocument();
    expect(within(table).getByText("Europa")).toBeInTheDocument();
    expect(within(table).getByText(t.noRegion)).toBeInTheDocument();
    // The page already says the material is fictitious; rows don't repeat it.
    expect(within(table).queryByText(t.demoRow)).not.toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("SearchHelp", () => {
  it("lists the composition and designation examples and the rule", async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    const { container } = render(<SearchHelp onUse={onUse} />);
    await user.click(screen.getByText(ptBR.catalog.searchHelpTitle));
    expect(screen.getByText("comp:Cr>=12")).toBeInTheDocument();
    expect(screen.getByText("designacao:S30400")).toBeInTheDocument();
    expect(screen.getByText(ptBR.catalog.searchHelpRule)).toBeInTheDocument();

    await user.click(screen.getByText("comp:Ni:8-10"));
    expect(onUse).toHaveBeenCalledWith("comp:Ni:8-10");

    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("CompositionReport", () => {
  const report: CompositionSearchReport = {
    rule: "Composição por alcance da faixa.",
    undetermined: 3,
    without_composition: 3,
    conditions: [
      {
        label: "Cr ≥ 12 %",
        element: "Cr",
        element_name: "Cromo",
        satisfied: 1,
        not_satisfied: 1,
        undetermined: 3,
        undetermined_by_reason: {
          sem_composicao: 3,
          elemento_nao_declarado: 0,
          declarado_ausente: 0,
          resto_sem_numero: 0,
        },
      },
    ],
  };

  it("says which rule ran and how many were left out for lack of data", () => {
    render(<CompositionReport report={report} />);
    expect(screen.getByText(report.rule)).toBeInTheDocument();
    expect(screen.getByText(ptBR.catalog.compositionUndetermined(3))).toBeInTheDocument();
    expect(screen.getByText(ptBR.catalog.compositionWithout(3))).toBeInTheDocument();
    expect(screen.getByText(/Cr ≥ 12 %: 1 atende, 1 não atende, 3 sem dado/)).toBeInTheDocument();
    expect(screen.getByText(/3 sem composição cadastrada/)).toBeInTheDocument();
  });
});
