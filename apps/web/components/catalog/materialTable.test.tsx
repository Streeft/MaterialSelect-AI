import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { MaterialTable } from "./MaterialRows";

const t = ptBR.catalog;
const quality = { medido: 1, importado: 0, estimado: 0, missing: 0 };

function material(id: number, name: string, cls: string): MaterialListItem {
  return {
    id,
    name,
    class_name: cls,
    class_slug: cls.toLowerCase(),
    subclass: null,
    is_demo: false,
    is_own_record: false,
    keywords: [],
    designations: [],
    quality,
  };
}

const LIST = [
  material(1, "Zinco", "Metais"),
  material(2, "Aço 1020", "Metais"),
  material(3, "Alumina", "Cerâmicas"),
];

function names() {
  return screen
    .getAllByRole("rowheader")
    .map((cell) => within(cell).getAllByRole("link")[0]!.textContent);
}

describe("MaterialTable — ordenação e seleção (D-131)", () => {
  it("starts in the order the search returned, with every head's sort stated", () => {
    render(<MaterialTable materials={LIST} />);
    expect(names()).toEqual(["Zinco", "Aço 1020", "Alumina"]);
    expect(screen.getByRole("columnheader", { name: new RegExp(t.columnName) })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("sorts by name ascending, descending, then back to the original order", async () => {
    const user = userEvent.setup();
    render(<MaterialTable materials={LIST} />);
    const head = screen.getByRole("columnheader", { name: new RegExp(t.columnName) });
    const button = within(head).getByRole("button");

    await user.click(button);
    expect(head).toHaveAttribute("aria-sort", "ascending");
    expect(names()).toEqual(["Alumina", "Aço 1020", "Zinco"].sort((a, b) => a.localeCompare(b, "pt-BR")));

    await user.click(button);
    expect(head).toHaveAttribute("aria-sort", "descending");
    expect(names()[0]).toBe("Zinco");

    await user.click(button);
    expect(head).toHaveAttribute("aria-sort", "none");
    expect(names()).toEqual(["Zinco", "Aço 1020", "Alumina"]);
  });

  it("only one column is sorted at a time", async () => {
    const user = userEvent.setup();
    render(<MaterialTable materials={LIST} />);
    const name = screen.getByRole("columnheader", { name: new RegExp(t.columnName) });
    const cls = screen.getByRole("columnheader", { name: new RegExp(t.columnClass) });
    await user.click(within(name).getByRole("button"));
    await user.click(within(cls).getByRole("button"));
    expect(name).toHaveAttribute("aria-sort", "none");
    expect(cls).toHaveAttribute("aria-sort", "ascending");
  });

  it("shows no action bar until a row is picked, then counts and offers Comparar", async () => {
    const user = userEvent.setup();
    render(<MaterialTable materials={LIST} />);
    expect(screen.queryByRole("region", { name: t.selectionBar })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: t.selectRow("Zinco") }));
    const bar = screen.getByRole("region", { name: t.selectionBar });
    expect(within(bar).getByText(t.selectedCount(1))).toBeInTheDocument();
    // One material is not a comparison — the button is off and the reason is written.
    expect(within(bar).getByRole("button", { name: t.compareSelected })).toBeDisabled();
    expect(within(bar).getByText(t.compareNeedsTwo)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: t.selectRow("Alumina") }));
    expect(within(bar).getByText(t.selectedCount(2))).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: t.compareSelected })).toHaveAttribute(
      "href",
      "/app/comparar?materiais=1,3",
    );
  });

  it("select-all picks every listed row, is half-checked for a part, and clears", async () => {
    const user = userEvent.setup();
    render(<MaterialTable materials={LIST} />);
    const all = screen.getByRole("checkbox", { name: t.selectAll }) as HTMLInputElement;

    await user.click(screen.getByRole("checkbox", { name: t.selectRow("Zinco") }));
    expect(all.indeterminate).toBe(true);

    await user.click(all);
    expect(all.checked).toBe(true);
    expect(screen.getByText(t.selectedCount(3))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t.clearSelection }));
    expect(screen.queryByRole("region", { name: t.selectionBar })).not.toBeInTheDocument();
    expect(all.checked).toBe(false);
  });

  it("a selection never outlives its row: filtering a material out drops it from the count", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MaterialTable materials={LIST} />);
    await user.click(screen.getByRole("checkbox", { name: t.selectRow("Zinco") }));
    await user.click(screen.getByRole("checkbox", { name: t.selectRow("Alumina") }));
    rerender(<MaterialTable materials={LIST.filter((m) => m.id !== 1)} />);
    expect(screen.getByText(t.selectedCount(1))).toBeInTheDocument();
  });

  it("a material's name appears once in the table, so a lookup by name stays unambiguous", () => {
    // Regression: the checkbox's name used to be hidden text "Selecionar <nome>",
    // which made `getByText(nome)` match two elements in the golden-path E2E.
    render(<MaterialTable materials={LIST} />);
    expect(within(screen.getByRole("table")).getAllByText(/Alumina/)).toHaveLength(1);
  });

  it("has no accessibility violations with a selection open", async () => {
    const user = userEvent.setup();
    render(<MaterialTable materials={LIST} />);
    await user.click(screen.getByRole("checkbox", { name: t.selectRow("Zinco") }));
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("MaterialTable — seleção que atravessa páginas (D-232)", () => {
  it("diz 'em várias páginas' quando a seleção tem materiais que a página não mostra, e abre na Seleção com todos", () => {
    render(<MaterialTable materials={LIST} selection={{ ids: [1, 99], onChange: vi.fn() }} />);
    const bar = screen.getByRole("region", { name: t.selectionBar });

    expect(within(bar).getByText(t.selectedAcrossPages(2))).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: t.compareSelected })).toHaveAttribute(
      "href",
      "/app/comparar?materiais=1,99",
    );
    expect(within(bar).getByRole("link", { name: t.openInSelection })).toHaveAttribute(
      "href",
      "/app/selecao?etapa=restricoes&materiais=1,99",
    );
    // Only the row on this page is ticked.
    expect(screen.getByRole("checkbox", { name: t.selectRow("Zinco") })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: t.selectRow("Alumina") })).not.toBeChecked();
  });

  it("marcar e desmarcar uma linha mexe só nela, e 'selecionar todos' soma a página ao que as outras guardam", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTable materials={LIST} selection={{ ids: [99], onChange }} />);

    await user.click(screen.getByRole("checkbox", { name: t.selectRow("Alumina") }));
    expect(onChange).toHaveBeenLastCalledWith([99, 3]);

    await user.click(screen.getByRole("checkbox", { name: t.selectAll }));
    expect(onChange).toHaveBeenLastCalledWith([99, 1, 2, 3]);
  });

  it("'Limpar seleção' esvazia a seleção inteira, inclusive o que está em outras páginas", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTable materials={LIST} selection={{ ids: [1, 99], onChange }} />);
    await user.click(screen.getByRole("button", { name: t.clearSelection }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("a seleção só de outras páginas ainda mostra a barra, e não finge que a página inteira está marcada", () => {
    render(<MaterialTable materials={LIST} selection={{ ids: [98, 99], onChange: vi.fn() }} />);
    expect(screen.getByRole("region", { name: t.selectionBar })).toBeInTheDocument();
    const all = screen.getByRole("checkbox", { name: t.selectAll }) as HTMLInputElement;
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(false);
  });

  it("acima do limite da Seleção avisa que vão os primeiros", () => {
    const ids = Array.from({ length: 250 }, (_, i) => i + 10);
    render(<MaterialTable materials={LIST} selection={{ ids, onChange: vi.fn() }} />);
    const bar = screen.getByRole("region", { name: t.selectionBar });
    expect(within(bar).getByText(t.openInSelectionCapped(200))).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: t.openInSelection })).toHaveAttribute(
      "href",
      "/app/selecao?etapa=restricoes&materiais=10-209",
    );
  });

  it("não tem violação de acessibilidade com a seleção em várias páginas", async () => {
    render(<MaterialTable materials={LIST} selection={{ ids: [1, 99], onChange: vi.fn() }} />);
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
