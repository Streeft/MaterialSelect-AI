import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AtomicComposition,
  Comparison,
  CompositionEntry,
  Designation,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { copyTablesText as c } from "@/lib/i18n-copy-tables";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { ComputedTable } from "@/components/charts/ComputedSection";
import { CompositionTable } from "@/components/material/CompositionTable";
import { DesignationTable } from "@/components/material/DesignationTable";

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

function clipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

function rowsOf(writeText: ReturnType<typeof vi.fn>): string[][] {
  return (writeText.mock.calls[0]?.[0] as string).split("\n").map((l) => l.split("\t"));
}

function noBlankCell(rows: string[][]) {
  for (const row of rows) for (const field of row) expect(field).not.toBe("");
}

const comparison = {
  normalization: "minmax",
  properties: [],
  materials: [
    { material_id: 1, name: "Aço", class_name: "Metais", class_slug: "metais", cells: [], complete: true },
    { material_id: 2, name: "Liga B", class_name: "Metais", class_slug: "metais", cells: [], complete: false },
  ],
  notes: [],
  threshold_pct: null,
  computed: [
    {
      name: "Rigidez específica",
      expression: "modulo_young / densidade",
      goal: "maximize",
      dimension: "meter ** 2 / second ** 2",
      variables: ["modulo_young", "densidade"],
      values: [
        { material_id: 1, value: 26.5, undefined_reason: null },
        { material_id: 2, value: null, undefined_reason: "Sem valor para densidade" },
      ],
      defined_count: 1,
      undefined_count: 1,
      spread_pct: null,
      spread_state: "valores_insuficientes",
      exceeds_threshold: null,
    },
  ],
} as unknown as Comparison;

describe("Comparador: Copiar tabela das colunas calculadas (D-173)", () => {
  it("copia a coluna dita calculada, o valor em pt-BR e o indefinido com o motivo", async () => {
    const user = userEvent.setup();
    const writeText = clipboard();
    const { container } = render(<ComputedTable comparison={comparison} />);

    await user.click(screen.getByRole("button", { name: c.computed.aria }));

    const rows = rowsOf(writeText);
    expect(rows[0]?.[2]).toContain(`${ptBR.compare.computed.badge}: Rigidez específica (modulo_young / densidade)`);
    expect(rows[1]).toEqual(["Aço", "Metais", "26,5"]);
    expect(rows[2]).toEqual([
      "Liga B",
      "Metais",
      `${ptBR.compare.computed.undefinedLabel}: Sem valor para densidade`,
    ]);
    noBlankCell(rows);
    expect(rows[2]).not.toContain("0");
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });
});

function entry(overrides: Partial<CompositionEntry>): CompositionEntry {
  return {
    element: "Cr",
    element_name: "Cromo",
    atomic_number: 24,
    state: "faixa",
    condition_label: "laminado",
    value_min: 17.5,
    value_max: 19.5,
    value_nominal: null,
    original_unit: "%",
    normalized_min: 17.5,
    normalized_max: 19.5,
    normalized_nominal: null,
    canonical_unit: "percent",
    conversion_method: null,
    notes: null,
    data_quality: "IMPORTADO",
    source_label: "Fonte A",
    citation: null,
    is_demo: false,
    ...overrides,
  };
}

const entries: CompositionEntry[] = [
  entry({}),
  entry({ element: "Mo", element_name: "Molibdênio", state: "ausente", original_unit: null, normalized_min: null, normalized_max: null }),
  entry({ element: "Fe", element_name: "Ferro", state: "resto", original_unit: null, normalized_min: null, normalized_max: null, citation: "Tabela 2" }),
];

describe("Ficha: Copiar tabela de composição (D-173)", () => {
  it("copia a condição da tela, a ausência escrita e a fonte sem localização dita", async () => {
    const user = userEvent.setup();
    const writeText = clipboard();
    const { container } = render(<CompositionTable entries={entries} conditionLabel="laminado" />);

    await user.click(screen.getByRole("button", { name: c.composition.aria }));

    const rows = rowsOf(writeText);
    expect(rows[0]).not.toContain(c.composition.atomic);
    expect(rows[1]).toEqual([
      "laminado",
      "Cr (Cromo)",
      "17,5 % a 19,5 %",
      "17,5 % a 19,5 %",
      "Fonte A",
      ptBR.detail.noCitation,
      ptBR.quality.IMPORTADO,
    ]);
    expect(rows[2]?.[2]).toBe(ptBR.detail.contentAbsent);
    expect(rows[2]?.[3]).toBe(ptBR.detail.noOriginal);
    expect(rows[3]?.[2]).toBe(ptBR.detail.contentBalance);
    expect(rows[3]?.[5]).toBe("Tabela 2");
    noBlankCell(rows);
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("leva a % atômica só quando o servidor a derivou, com a ausência escrita nas linhas sem valor", async () => {
    const user = userEvent.setup();
    const writeText = clipboard();
    const atomic: AtomicComposition = {
      condition_label: "laminado",
      label: "derivada",
      basis: "IUPAC",
      entries: [{ element: "Cr", atomic_min: 18.1, atomic_max: 20.2 }],
      reason: null,
      message: null,
    };
    render(<CompositionTable entries={entries} conditionLabel="laminado" atomic={atomic} />);

    await user.click(screen.getByRole("button", { name: c.composition.aria }));

    const rows = rowsOf(writeText);
    expect(rows[0]).toContain(c.composition.atomic);
    expect(rows[1]?.[3]).toBe("18,1 % a 20,2 %");
    expect(rows[2]?.[3]).toBe(ptBR.quality.AUSENTE);
    noBlankCell(rows);
  });

  it("sem composição não há botão", () => {
    render(<CompositionTable entries={[]} />);
    expect(screen.queryByRole("button", { name: c.composition.aria })).not.toBeInTheDocument();
  });
});

const designation: Designation = {
  system: "AISI_SAE",
  system_label: "AISI/SAE",
  code: "=304",
  region: null,
  source_label: "Fonte A",
  citation: null,
  is_demo: false,
};

describe("Ficha: Copiar tabela de designações (D-173)", () => {
  it("copia sistema, código, região e fonte, com o que falta dito por escrito", async () => {
    const user = userEvent.setup();
    const writeText = clipboard();
    const { container } = render(<DesignationTable designations={[designation]} />);

    await user.click(screen.getByRole("button", { name: c.designations.aria }));

    const rows = rowsOf(writeText);
    expect(rows[1]).toEqual(["AISI/SAE", "'=304", ptBR.detail.noRegion, "Fonte A", ptBR.detail.noCitation]);
    noBlankCell(rows);
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("sem designação não há botão", () => {
    render(<DesignationTable designations={[]} />);
    expect(screen.queryByRole("button", { name: c.designations.aria })).not.toBeInTheDocument();
  });
});
