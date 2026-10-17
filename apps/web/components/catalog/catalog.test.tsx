import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { DensityToggle } from "@/components/ui";
import { MaterialList } from "./MaterialList";

const quality = { medido: 0, importado: 0, estimado: 3, missing: 0 };

function material(id: number, is_demo: boolean): MaterialListItem {
  return {
    id,
    name: `Material ${id}`,
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    is_demo,
    is_own_record: false,
    keywords: [],
    quality,
    designations: [],
  };
}

describe("MaterialList", () => {
  it("lists every material without any demonstration notice or badge", () => {
    const { container } = render(<MaterialList materials={[material(1, true), material(2, false)]} />);

    // Card and table row both render (the breakpoint picks one), so each name appears twice.
    expect(within(container).getAllByText("Material 1")).toHaveLength(2);
    expect(within(container).getAllByText("Material 2")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/demonstrativ|fictíci/i);
  });
});

describe("DensityToggle (D-91)", () => {
  it("switches every table to compact rows, and back", async () => {
    const user = userEvent.setup();
    const { container, getByRole } = render(
      <>
        <DensityToggle />
        <MaterialList materials={[material(1, false)]} />
      </>,
    );
    const region = () => container.querySelector('[role="region"]');
    expect(region()).toHaveAttribute("data-density", "comfortable");

    await user.click(getByRole("button", { name: ptBR.catalog.densityCompact }));
    expect(region()).toHaveAttribute("data-density", "compact");
    expect(getByRole("button", { name: ptBR.catalog.densityCompact })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(getByRole("button", { name: ptBR.catalog.densityComfortable }));
    expect(region()).toHaveAttribute("data-density", "comfortable");
  });
});
