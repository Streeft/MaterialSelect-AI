import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PropertyGroupCard } from "./PropertyGroup";
import type { PropertyGroup, PropertyValueOut } from "@/lib/types";

function makeValue(overrides: Partial<PropertyValueOut>): PropertyValueOut {
  return {
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
  it("renders a missing value as 'ausente', never as 0", () => {
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

    expect(screen.getByText("ausente")).toBeInTheDocument();
    // The critical guarantee: a missing value must not be shown as a numeric 0.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
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
