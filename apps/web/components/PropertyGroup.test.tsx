import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyGroupCard } from "./PropertyGroup";
import { ptBR } from "@/lib/i18n";
import type { PropertyGroup, PropertyValueOut } from "@/lib/types";

function makeValue(overrides: Partial<PropertyValueOut>): PropertyValueOut {
  return {
    display_unit: null,
    display_value: null,
    display_min: null,
    display_max: null,
    display_typical: null,
    display_uncertainty: null,
    property_slug: "prop",
    property_name: "Propriedade",
    symbol: null,
    category: "FISICA",
    is_missing: false,
    is_interval: false,
    value_scalar: null,
    value_min: null,
    value_max: null,
    value_typical: null,
    original_unit: null,
    normalized_value: null,
    canonical_unit: null,
    conversion_method: null,
    uncertainty: null,
    measurement_condition: null,
    notes: null,
    data_quality: "ESTIMADO",
    source_label: null,
    ...overrides,
  };
}

describe("PropertyGroupCard", () => {
  it("renders a missing value as absent, never as 0 and never as a dash", () => {
    const group: PropertyGroup = {
      category: "TERMICA",
      properties: [
        makeValue({
          property_slug: "condutividade_termica",
          property_name: "Condutividade térmica",
          category: "TERMICA",
          is_missing: true,
        }),
      ],
    };

    render(<PropertyGroupCard group={group} />);

    expect(screen.getByText(ptBR.quality.AUSENTE)).toBeInTheDocument();
    // The critical guarantee: a missing value must not be shown as a numeric 0,
    // nor as one of the punctuation marks that read as "nothing worth saying".
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    for (const filler of ["—", "-", "–", "N/A", "n/d"]) {
      expect(screen.queryByText(filler)).not.toBeInTheDocument();
    }
  });

  it("puts the provenance of a value one gesture away", async () => {
    const user = userEvent.setup();
    const group: PropertyGroup = {
      category: "FISICA",
      properties: [
        makeValue({
          property_slug: "densidade",
          property_name: "Densidade",
          category: "FISICA",
          value_scalar: 2.7,
          original_unit: "g/cm**3",
          normalized_value: 2700,
          canonical_unit: "kg/m**3",
          conversion_method: "pint",
          source_label: "ASM Handbook",
        }),
      ],
    };

    render(<PropertyGroupCard group={group} />);
    await user.click(
      screen.getByRole("button", { name: ptBR.provenance.trigger }),
    );

    const panel = screen.getByRole("dialog", { name: ptBR.provenance.trigger });
    // §3.2: the reference for a value is reachable in the interface, not only
    // in the exported report.
    expect(within(panel).getByText("ASM Handbook")).toBeInTheDocument();
    expect(within(panel).getByText("pint")).toBeInTheDocument();
  });

  it("renders a scalar value with its original unit", () => {
    const group: PropertyGroup = {
      category: "FISICA",
      properties: [
        makeValue({
          property_slug: "densidade",
          property_name: "Densidade",
          category: "FISICA",
          value_scalar: 2.7,
          original_unit: "g/cm**3",
          normalized_value: 2700,
          canonical_unit: "kg/m**3",
        }),
      ],
    };

    render(<PropertyGroupCard group={group} />);
    expect(screen.getByText("Densidade")).toBeInTheDocument();
    expect(screen.getByText(/2,7/)).toBeInTheDocument();
  });

  it("renders an interval value with min and max", () => {
    const group: PropertyGroup = {
      category: "MECANICA",
      properties: [
        makeValue({
          property_slug: "limite_escoamento",
          property_name: "Limite de escoamento",
          category: "MECANICA",
          is_interval: true,
          value_min: 40,
          value_max: 60,
          value_typical: 48,
          original_unit: "MPa",
        }),
      ],
    };

    render(<PropertyGroupCard group={group} />);
    // min and max both appear in the "40 – 60" range text.
    expect(screen.getByText(/40/)).toBeInTheDocument();
    expect(screen.getByText(/60/)).toBeInTheDocument();
  });
});

describe("PropertyGroupCard e a unidade de leitura (D-70)", () => {
  function groupOf(value: PropertyValueOut): PropertyGroup {
    return { category: "MECANICA", properties: [value] };
  }

  it("mostra a leitura, e não o número canônico", () => {
    // Ninguém lê módulo de Young em pascal: esta ficha mostrava 210000000000.
    render(
      <PropertyGroupCard
        group={groupOf(
          makeValue({
            property_slug: "modulo_young",
            property_name: "Módulo de Young",
            category: "MECANICA",
            value_scalar: 210e9,
            original_unit: "Pa",
            normalized_value: 210e9,
            canonical_unit: "Pa",
            display_unit: "GPa",
            display_value: 210,
          }),
        )}
      />,
    );

    expect(screen.getByText("210")).toBeDefined();
    expect(screen.getByText("GPa")).toBeDefined();
    expect(screen.queryByText("210.000.000.000")).toBeNull();
  });

  it("escreve °C, e não degC", () => {
    // A unidade chega à tela de verdade desde o D-70, e `degC` é o que o Pint
    // escreve — não o que um leitor de uma tabela de materiais já viu.
    render(
      <PropertyGroupCard
        group={groupOf(
          makeValue({
            property_slug: "temp_max_servico",
            property_name: "Temperatura máxima de serviço",
            category: "MECANICA",
            value_scalar: 573.15,
            original_unit: "kelvin",
            canonical_unit: "kelvin",
            display_unit: "degC",
            display_value: 300,
          }),
        )}
      />,
    );

    expect(screen.getByText("°C")).toBeDefined();
    expect(screen.queryByText("degC")).toBeNull();
  });

  it("uma incerteza sai na leitura, e como diferença", () => {
    // ±5 K lidos em °C são ±5 °C, não ±268,15 — o número errado apareceria ao
    // lado de uma temperatura que converteu certo, e nada pareceria fora do
    // lugar. Quem faz a conta é o backend; aqui se fixa que a tela usa o campo
    // convertido e não o canônico.
    render(
      <PropertyGroupCard
        group={groupOf(
          makeValue({
            property_slug: "temp_max_servico",
            property_name: "Temperatura máxima de serviço",
            category: "MECANICA",
            value_scalar: 573.15,
            original_unit: "kelvin",
            canonical_unit: "kelvin",
            uncertainty: 5,
            display_unit: "degC",
            display_value: 300,
            display_uncertainty: 5,
          }),
        )}
      />,
    );

    expect(screen.getByText(/± 5/)).toBeDefined();
  });
});
