import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { PropertyDefinition } from "@/lib/types";
import { StageList, emptyLimitStage, type StageState } from "./StageList";
import { emptyConstraint } from "./ConstraintEditor";

function withRow() {
  const stage = emptyLimitStage() as Extract<StageState, { kind: "limit" }>;
  stage.group.constraints.push(emptyConstraint("c0"));
  return stage;
}

vi.mock("react-plotly.js", () => ({ default: () => null }));

function def(slug: string, name: string, min_level?: number): PropertyDefinition {
  return {
    display_unit: null,
    id: 1,
    name,
    slug,
    symbol: null,
    description: null,
    category: "FISICA",
    physical_dimension: "[mass] / [length] ** 3",
    canonical_unit: "kg/m**3",
    accepted_units: ["kg/m**3"],
    is_interval: false,
    better_direction: "LOWER",
    allows_log_scale: true,
    value_count: 3,
    min_level,
  } as PropertyDefinition;
}

const properties = [
  def("densidade", "Densidade", 1),
  def("fadiga", "Limite de fadiga", 3),
  def("tenacidade", "Tenacidade à fratura", 3),
  def("sem_nivel", "Grandeza sem nível", undefined),
];

function mount(stages: StageState[], depthLevel?: 1 | 2 | 3) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StageList
        stages={stages}
        properties={properties}
        classes={[]}
        depthLevel={depthLevel}
        onChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

async function offered(): Promise<string[]> {
  await userEvent.click(screen.getByRole("combobox", { name: ptBR.selection.property }));
  return within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent ?? "");
}

describe("StageList: nível de profundidade nos critérios (D-165)", () => {
  it("no Nível 1 oferece só as grandezas do nível, e as sem nível declarado", async () => {
    mount([withRow()], 1);
    const names = await offered();
    expect(names.join("|")).toContain("Densidade");
    expect(names.join("|")).toContain("Grandeza sem nível");
    expect(names.join("|")).not.toContain("Limite de fadiga");
    expect(names.join("|")).not.toContain("Tenacidade à fratura");
  });

  it("sem nível, oferece tudo como antes", async () => {
    mount([withRow()]);
    expect((await offered()).join("|")).toContain("Limite de fadiga");
  });

  it("não tira o critério já escolhido, mesmo de nível maior", async () => {
    const stage = withRow();
    stage.group.constraints[0]!.property_slug = "fadiga";
    const { container } = mount([stage], 1);
    const names = await offered();
    expect(names.join("|")).toContain("Limite de fadiga");
    expect(names.join("|")).not.toContain("Tenacidade à fratura");
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });
});
