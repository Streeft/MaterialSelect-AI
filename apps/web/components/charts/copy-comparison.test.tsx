import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery as render } from "@/lib/testing/queryWrapper";
import { ComparisonView } from "./ComparisonView";
import { flowText } from "@/lib/i18n-flow";
import { copyTablesText } from "@/lib/i18n-copy-tables";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { Comparison } from "@/lib/types";

vi.mock("react-plotly.js", () => ({ default: () => null }));

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

const comparison = {
  normalization: "minmax",
  properties: [
    {
      property_slug: "densidade",
      property_name: "Densidade",
      symbol: "ρ",
      unit: "kg/m**3",
      category: "FISICA",
      better_direction: "LOWER",
      allows_log_scale: true,
      min_value: 2700,
      max_value: 7850,
      present_count: 1,
      missing_material_ids: [2],
    },
  ],
  materials: [
    {
      material_id: 1,
      name: "Aço",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: false,
      complete: true,
      cells: [
        {
          property_slug: "densidade",
          is_missing: false,
          value: 7850,
          normalized: 1,
          difference_state: "sem_referencia",
          difference_pct: null,
          data_quality: "MEDIDO",
        },
      ],
    },
    {
      material_id: 2,
      name: "Liga sem dado",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: false,
      complete: false,
      cells: [
        {
          property_slug: "densidade",
          is_missing: true,
          value: null,
          normalized: null,
          difference_state: "valor_ausente",
          difference_pct: null,
          data_quality: null,
        },
      ],
    },
  ],
  notes: [],
  threshold_pct: null,
  computed: [],
} as unknown as Comparison;

describe("Comparador: Copiar tabela (D-164)", () => {
  it("copia a tabela da tela, com a ausência escrita, e diz que copiou", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ComparisonView comparison={comparison} mode="table" />);

    await user.click(screen.getByRole("button", { name: copyTablesText.comparison.aria }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const rows = (writeText.mock.calls[0]?.[0] as string).split("\n").map((l) => l.split("\t"));
    expect(rows[1]).toEqual(["Aço", "Metais", "7.850"]);
    expect(rows[2]).toEqual(["Liga sem dado", "Metais", "Ausente"]);
    expect(await screen.findByText(flowText.copy.done)).toBeInTheDocument();
  });

  it("sem violação de acessibilidade com o botão", async () => {
    const { container } = render(<ComparisonView comparison={comparison} mode="table" />);
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });
});
