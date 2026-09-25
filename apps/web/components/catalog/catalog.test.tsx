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
  };
}

describe("MaterialList — the demonstration notice (D-91)", () => {
  it("says once, above the list, that every row is fictitious", () => {
    const { container } = render(<MaterialList materials={[material(1, true), material(2, true)]} />);

    expect(within(container).getByText(ptBR.catalog.allDemo)).toBeInTheDocument();
    // No badge per row: repeated on every line it stopped being read.
    expect(within(container).queryAllByText(ptBR.demoBadge)).toHaveLength(0);
  });

  it("marks each fictitious row when the list mixes demonstration and real records", () => {
    const { container } = render(<MaterialList materials={[material(1, true), material(2, false)]} />);

    expect(within(container).queryByText(ptBR.catalog.allDemo)).not.toBeInTheDocument();
    // Card and table row both render (the breakpoint picks one), one badge each.
    expect(within(container).getAllByText(ptBR.demoBadge)).toHaveLength(2);
  });

  it("says nothing about demonstration data when there is none", () => {
    const { container } = render(<MaterialList materials={[material(1, false)]} />);
    expect(within(container).queryByText(ptBR.catalog.allDemo)).not.toBeInTheDocument();
    expect(within(container).queryAllByText(ptBR.demoBadge)).toHaveLength(0);
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
