import { describe, expect, it, vi } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { renderWithQuery as render } from "@/lib/testing/queryWrapper";
import { screen } from "shadow-dom-testing-library";
import { ComparisonView } from "./ComparisonView";
import { compareViewText } from "@/lib/i18n-compare-view";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { CompareAxis, CompareCell, CompareMaterial, Comparison } from "@/lib/types";

vi.mock("@/lib/api", () => ({ listGlossary: () => Promise.resolve([]) }));

/*
 * D-214: the backend says who is best in each property and which properties
 * separate nobody (`best_material_ids`, `all_equal`). The screen only shows it:
 * it never decides "bigger or smaller wins" itself (ADR 0004).
 */

function axis(slug: string, name: string, overrides: Partial<CompareAxis> = {}): CompareAxis {
  return {
    property_slug: slug,
    property_name: name,
    symbol: null,
    unit: "kg/m**3",
    category: "FISICA",
    better_direction: "HIGHER",
    allows_log_scale: false,
    min_value: 1,
    max_value: 2,
    present_count: 2,
    missing_material_ids: [],
    best_material_ids: [],
    all_equal: false,
    ...overrides,
  };
}

function cell(slug: string, value: number | null): CompareCell {
  return {
    display_unit: null,
    display_value: null,
    display_min: null,
    display_max: null,
    display_uncertainty: null,
    property_slug: slug,
    is_missing: value === null,
    value,
    normalized: value === null ? null : value / 100,
    value_min: null,
    value_max: null,
    original_value: null,
    original_unit: null,
    conversion_method: null,
    uncertainty: null,
    data_quality: "MEDIDO",
    difference_pct: null,
    difference_state: "sem_referencia",
    source_label: null,
    measurement_condition: null,
  };
}

function material(id: number, name: string, values: (number | null)[], slugs: string[]): CompareMaterial {
  const cells = slugs.map((slug, i) => cell(slug, values[i] ?? null));
  return {
    material_id: id,
    name,
    class_name: "Metais",
    class_slug: "metais",
    is_demo: false,
    cells,
    complete: cells.every((c) => !c.is_missing),
  };
}

const SLUGS = ["resistencia", "densidade", "dureza", "tenacidade"];

/** resistencia: material 2 wins; densidade: all equal; dureza: nobody has it; tenacidade: neutral. */
function comparison(): Comparison {
  return {
    normalization: "minmax",
    properties: [
      axis("resistencia", "Resistência", { best_material_ids: [2] }),
      axis("densidade", "Densidade", { all_equal: true }),
      axis("dureza", "Dureza", { present_count: 0, missing_material_ids: [1, 2] }),
      axis("tenacidade", "Tenacidade", { better_direction: "NEUTRAL" }),
    ],
    materials: [
      material(1, "Aço A", [40, 7800, null, 30], SLUGS),
      material(2, "Aço B", [90, 7800, null, 50], SLUGS),
    ],
    notes: [],
  };
}

describe("ComparisonView: o melhor de cada propriedade (D-214)", () => {
  it("marca só quem o servidor mandou, com texto e não só com cor", () => {
    render(<ComparisonView comparison={comparison()} mode="table" />);
    const winner = screen.getByRole("rowheader", { name: /Aço B/ }).closest("tr")!;
    const loser = screen.getByRole("rowheader", { name: /Aço A/ }).closest("tr")!;
    expect(within(winner).getAllByText(compareViewText.best)).toHaveLength(1);
    expect(within(loser).queryByText(compareViewText.best)).toBeNull();
  });

  it("não marca ninguém numa propriedade neutra, igual ou ausente em todos", () => {
    render(<ComparisonView comparison={comparison()} mode="table" />);
    // Only "Resistência" has a best: exactly one badge in the whole table.
    expect(screen.getAllByText(compareViewText.best)).toHaveLength(1);
  });

  it("sem os campos novos (payload antigo) a tabela continua igual, sem marca", () => {
    const old = comparison();
    for (const p of old.properties) {
      delete p.best_material_ids;
      delete p.all_equal;
    }
    render(<ComparisonView comparison={old} mode="table" onlyDifferences />);
    expect(screen.queryByText(compareViewText.best)).toBeNull();
    expect(screen.getByRole("columnheader", { name: /Densidade/ })).toBeInTheDocument();
  });
});

describe("ComparisonView: só diferenças (D-214)", () => {
  it("esconde as colunas iguais e as sem valor em todos, e diz quais", () => {
    render(<ComparisonView comparison={comparison()} mode="table" onlyDifferences />);
    expect(screen.getByRole("columnheader", { name: /Resistência/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Tenacidade/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Densidade/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Dureza/ })).toBeNull();
    expect(screen.getByText(compareViewText.onlyDifferences.hidden(2))).toBeInTheDocument();
    expect(
      screen.getByText(compareViewText.onlyDifferences.equalIn("Densidade")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(compareViewText.onlyDifferences.absentIn("Dureza")),
    ).toBeInTheDocument();
  });

  it("desligado, mostra todas as colunas e nenhum aviso", () => {
    render(<ComparisonView comparison={comparison()} mode="table" />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.queryByText(compareViewText.onlyDifferences.hidden(2))).toBeNull();
  });

  it("quando tudo é igual, diz isso em vez de mostrar uma tabela vazia", () => {
    const flat = comparison();
    flat.properties = flat.properties.map((p) => ({ ...p, all_equal: true }));
    render(<ComparisonView comparison={flat} mode="table" onlyDifferences />);
    expect(screen.getByText(compareViewText.onlyDifferences.nothingLeft)).toBeInTheDocument();
  });

  it("o resultado é acessível", async () => {
    const { container } = render(
      <ComparisonView comparison={comparison()} mode="table" onlyDifferences />,
    );
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

function crowded(n: number): Comparison {
  const slugs = ["a", "b", "c"];
  return {
    normalization: "minmax",
    properties: slugs.map((s) => axis(s, `Prop ${s}`)),
    materials: Array.from({ length: n }, (_, i) =>
      material(i + 1, `Material ${i + 1}`, [10 + i, 20 + i, 30 + i], slugs),
    ),
    notes: [],
  };
}

describe("ComparisonView: radar com muitos materiais (D-214)", () => {
  it("com 20 materiais sugere outra visão em vez de desenhar um radar ilegível", () => {
    const onModeChange = vi.fn();
    const { container } = render(
      <ComparisonView comparison={crowded(20)} mode="radar" onModeChange={onModeChange} />,
    );
    expect(container.querySelector("svg[data-chart-figure]")).toBeNull();
    expect(screen.getByText(compareViewText.radar.crowdedTitle(20))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: compareViewText.radar.goParallel }));
    expect(onModeChange).toHaveBeenCalledWith("parallel");
    fireEvent.click(screen.getByRole("button", { name: compareViewText.radar.goHeatmap }));
    expect(onModeChange).toHaveBeenCalledWith("heatmap");
  });

  it("o leitor ainda pode pedir o radar mesmo assim: nada é recusado", () => {
    const { container } = render(
      <ComparisonView comparison={crowded(20)} mode="radar" onModeChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: compareViewText.radar.drawAnyway }));
    expect(container.querySelector("svg[data-chart-figure]")).not.toBeNull();
    expect(screen.queryByText(compareViewText.radar.crowdedTitle(20))).toBeNull();
  });

  it("com poucos materiais o radar desenha direto, sem aviso", () => {
    const { container } = render(
      <ComparisonView comparison={crowded(5)} mode="radar" onModeChange={vi.fn()} />,
    );
    expect(container.querySelector("svg[data-chart-figure]")).not.toBeNull();
    expect(screen.queryByText(compareViewText.radar.crowdedTitle(5))).toBeNull();
  });

  it("o aviso é acessível", async () => {
    const { container } = render(
      <ComparisonView comparison={crowded(20)} mode="radar" onModeChange={vi.fn()} />,
    );
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
