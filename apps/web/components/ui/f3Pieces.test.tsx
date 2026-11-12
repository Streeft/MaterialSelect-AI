import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { PropertyValueOut } from "@/lib/types";
import { DocSection, Outline } from "./Outline";

const replace = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ current: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.current),
  usePathname: () => "/app/materiais/5",
}));
vi.mock("@/lib/useWindowClass", () => ({ useWindowClass: () => "expanded" }));

const { PropertyGroupCard } = await import("@/components/PropertyGroup");

const t = ptBR.ds;

async function expectAccessible(container: Element) {
  const violations = await findA11yViolations(container);
  expect(violations, describeViolations(violations)).toEqual([]);
}

function young(overrides: Partial<PropertyValueOut> = {}): PropertyValueOut {
  return {
    property_slug: "modulo_young",
    property_name: "Módulo de Young",
    symbol: "E",
    category: "MECANICA",
    is_missing: false,
    is_interval: false,
    value_scalar: 210e9,
    value_min: null,
    value_max: null,
    value_typical: null,
    original_unit: "Pa",
    normalized_value: 210e9,
    canonical_unit: "Pa",
    conversion_method: null,
    uncertainty: null,
    measurement_condition: null,
    notes: null,
    data_quality: "MEDIDO",
    source_label: null,
    display_unit: "GPa",
    display_value: 210,
    display_min: null,
    display_max: null,
    display_typical: null,
    display_uncertainty: null,
    ...overrides,
  };
}

const UNITS = new Map([["modulo_young", { accepted: ["GPa", "MPa", "psi"], convention: "GPa" }]]);

beforeEach(() => {
  replace.mockReset();
  search.current = "";
});

describe("UnitChip — a unidade no valor (D-214)", () => {
  it("writes the unit as a chip beside the number, and the number stays the server's", async () => {
    const { container } = render(
      <PropertyGroupCard group={{ category: "MECANICA", properties: [young()] }} units={UNITS} />,
    );
    expect(screen.getByText("210")).toBeInTheDocument();
    const chip = screen.getByRole("button", { name: ptBR.units.chipLabel("Módulo de Young", "GPa") });
    expect(chip).toHaveTextContent("GPa");
    await expectAccessible(container);
  });

  it("choosing a unit asks the server again through the URL (D-70)", async () => {
    render(<PropertyGroupCard group={{ category: "MECANICA", properties: [young()] }} units={UNITS} />);
    await userEvent.click(screen.getByRole("button", { name: /Unidade de Módulo de Young/ }));
    const options = screen.getByRole("group", { name: ptBR.units.chipTitle("Módulo de Young") });
    expect(within(options).getByRole("button", { name: "GPa" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(options).getByRole("button", { name: "MPa" }));
    expect(replace).toHaveBeenCalledWith("/app/materiais/5?unidades=modulo_young%3AMPa", { scroll: false });
    // The choice closes the panel.
    expect(screen.queryByRole("group", { name: ptBR.units.chipTitle("Módulo de Young") })).toBeNull();
  });

  it("going back to the quantity's own unit removes the choice from the URL", async () => {
    search.current = "unidades=modulo_young:MPa";
    render(
      <PropertyGroupCard
        group={{ category: "MECANICA", properties: [young({ display_unit: "MPa", display_value: 210000 })] }}
        units={UNITS}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Unidade de Módulo de Young/ }));
    await userEvent.click(screen.getByRole("button", { name: "GPa" }));
    expect(replace).toHaveBeenCalledWith("/app/materiais/5", { scroll: false });
  });

  it("a quantity with one unit has no chip — the unit is written, no choice promised", () => {
    render(
      <PropertyGroupCard
        group={{ category: "MECANICA", properties: [young()] }}
        units={new Map([["modulo_young", { accepted: ["GPa"], convention: "GPa" }]])}
      />,
    );
    expect(screen.queryByRole("button", { name: /Unidade de/ })).toBeNull();
    expect(screen.getByText("GPa")).toBeInTheDocument();
  });

  it("a missing value gets no chip: there is no number to read in another unit", () => {
    render(
      <PropertyGroupCard
        group={{ category: "MECANICA", properties: [young({ is_missing: true, value_scalar: null, display_value: null })] }}
        units={UNITS}
      />,
    );
    expect(screen.queryByRole("button", { name: /Unidade de/ })).toBeNull();
  });
});

describe("DocSection e Outline (D-214)", () => {
  function Page() {
    return (
      <div>
        <Outline
          items={[
            { id: "a", label: "Propriedades" },
            { id: "b", label: "Curvas" },
          ]}
        />
        <DocSection id="a" title="Propriedades" description="Os valores.">
          <p>Conteúdo A</p>
        </DocSection>
        <DocSection id="b" title="Curvas" defaultOpen={false}>
          <p>Conteúdo B</p>
        </DocSection>
      </div>
    );
  }

  it("folds and unfolds with the heading's button, the heading staying a heading", async () => {
    const { container } = render(<Page />);
    const toggle = screen.getByRole("button", { name: "Propriedades" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Propriedades" })).toContainElement(toggle);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Conteúdo A")).not.toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Propriedades" })).toBeInTheDocument();
    await expectAccessible(container);
  });

  it("the index opens a folded section before it jumps there", async () => {
    render(<Page />);
    expect(screen.getByText("Conteúdo B")).not.toBeVisible();
    const nav = screen.getByRole("navigation", { name: t.outline });
    await userEvent.click(within(nav).getByRole("link", { name: "Curvas" }));
    expect(screen.getByRole("button", { name: "Curvas" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Conteúdo B")).toBeVisible();
  });
});
