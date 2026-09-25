import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { CostCurveChart } from "./CostCurveChart";
import type { CostResult } from "@/lib/types";

const mockResult: CostResult = {
  material_id: 7,
  material_name: "Liga Alumínio Demo A",
  part_mass: 2,
  batch_size: 1000,
  write_off_years: 5,
  load_factor: 0.5,
  material_cost_per_mass: 8,
  monetary_unit_note:
    "Os valores estão em unidade monetária não especificada: o catálogo registra custo por massa sem declarar moeda.",
  costed: [
    {
      process_id: 1,
      process_slug: "fundicao-areia",
      process_name: "Fundição em areia",
      class_name: "Conformação",
      rank: 1,
      terms: {
        material: 20,
        tooling: 12,
        overhead: 7.08,
        capital: 0.95,
        total: 40.03,
        batch_sensitive: 12,
      },
      curve: [
        { batch_size: 1, cost: 12028.03 },
        { batch_size: 10, cost: 1228.03 },
        { batch_size: 100, cost: 148.03 },
        { batch_size: 1000, cost: 40.03 },
        { batch_size: 10000, cost: 29.23 },
        { batch_size: 100000, cost: 28.15 },
        { batch_size: 1000000, cost: 28.04 },
      ],
    },
    {
      process_id: 3,
      process_slug: "injecao",
      process_name: "Injeção sob pressão",
      class_name: "Conformação",
      rank: 2,
      terms: {
        material: 18,
        tooling: 50,
        overhead: 3.2,
        capital: 1.5,
        total: 72.7,
        batch_sensitive: 50,
      },
      curve: [
        { batch_size: 1, cost: 50022.7 },
        { batch_size: 10, cost: 5022.7 },
        { batch_size: 100, cost: 522.7 },
        { batch_size: 1000, cost: 72.7 },
        { batch_size: 10000, cost: 27.7 },
        { batch_size: 100000, cost: 23.2 },
        { batch_size: 1000000, cost: 22.75 },
      ],
    },
  ],
  uncosted: [],
};

describe("CostCurveChart", () => {
  it("renderiza a figura SVG com o título e as séries na legenda", () => {
    render(<CostCurveChart result={mockResult} />);

    expect(screen.getByRole("heading", { name: "Curva Custo × Lote", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /Curva Custo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fundição em areia" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Injeção sob pressão" })).toBeInTheDocument();
  });

  it("alterna entre gráfico e tabela de dados acessível (D-31)", async () => {
    const user = userEvent.setup();
    render(<CostCurveChart result={mockResult} />);

    const tableButton = screen.getByShadowRole("button", { name: "Tabela" });
    await user.click(tableButton);

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(within(table).getByText("Fundição em areia")).toBeInTheDocument();
    expect(within(table).getByText("Injeção sob pressão")).toBeInTheDocument();
  });

  it("permite ocultar séries pela legenda", async () => {
    const user = userEvent.setup();
    render(<CostCurveChart result={mockResult} />);

    const sandCastingBtn = screen.getByRole("button", { name: "Fundição em areia" });
    expect(sandCastingBtn).toHaveAttribute("aria-pressed", "true");

    await user.click(sandCastingBtn);
    expect(sandCastingBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("não renderiza nada quando não há processos com curva", () => {
    const emptyResult: CostResult = {
      ...mockResult,
      costed: [],
    };
    const { container } = render(<CostCurveChart result={emptyResult} />);
    expect(container).toBeEmptyDOMElement();
  });
});
