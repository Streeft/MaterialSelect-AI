import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { AnnouncerProvider } from "./Announcer";
import { Block, reorder, useReorder } from "./Block";
import { EmptyState } from "./Feedback";
import { FilterBar, type FilterField } from "./FilterBar";
import { MenuItem } from "./Menu";
import { PageDoc } from "./PageDoc";
import { PropertyList } from "./PropertyList";
import { SidePeek } from "./SidePeek";
import { Workbench } from "./Workbench";

const t = ptBR.ds;

vi.mock("@/lib/useWindowClass", () => ({ useWindowClass: () => "expanded" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

async function expectAccessible(container: Element) {
  const violations = await findA11yViolations(container);
  expect(violations, describeViolations(violations)).toEqual([]);
}

describe("reorder (D-206)", () => {
  it("moves one item and leaves the input alone", () => {
    const input = ["a", "b", "c", "d"] as const;
    expect(reorder(input, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(reorder(input, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(input).toEqual(["a", "b", "c", "d"]);
  });

  it("returns a copy unchanged for an out-of-range or no-op move", () => {
    expect(reorder(["a", "b"], 0, 0)).toEqual(["a", "b"]);
    expect(reorder(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

function Blocks() {
  const [items, setItems] = useState(["Mapa", "Tabela", "Notas"]);
  const [hidden, setHidden] = useState<string[]>([]);
  const { handleProps, itemProps } = useReorder({
    items,
    onReorder: setItems,
    nameOf: (item) => item,
  });
  return (
    <div>
      <ol aria-label="Ordem">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      {items.map((item, index) => (
        <Block
          key={item}
          name={item}
          handle={handleProps(index)}
          item={itemProps(index)}
          hidden={hidden.includes(item)}
          onToggleHidden={() =>
            setHidden((h) => (h.includes(item) ? h.filter((x) => x !== item) : [...h, item]))
          }
        >
          {item}
        </Block>
      ))}
    </div>
  );
}

describe("Block + useReorder (D-206)", () => {
  it("moves a block with Alt + arrow on its grip, and says where it went", async () => {
    render(
      <AnnouncerProvider>
        <Blocks />
      </AnnouncerProvider>,
    );
    const grip = screen.getByRole("button", { name: t.dragHandle("Mapa") });
    fireEvent.keyDown(grip, { key: "ArrowDown", altKey: true });
    const order = within(screen.getByRole("list", { name: "Ordem" })).getAllByRole("listitem");
    expect(order.map((li) => li.textContent)).toEqual(["Tabela", "Mapa", "Notas"]);
    expect(await screen.findByText(t.moved("Mapa", 2, 3))).toBeInTheDocument();
  });

  it("ignores a plain arrow, so the grip does not steal page scrolling", () => {
    render(<Blocks />);
    fireEvent.keyDown(screen.getByRole("button", { name: t.dragHandle("Notas") }), {
      key: "ArrowUp",
    });
    const order = within(screen.getByRole("list", { name: "Ordem" })).getAllByRole("listitem");
    expect(order.map((li) => li.textContent)).toEqual(["Mapa", "Tabela", "Notas"]);
  });

  it("hides a block without removing it, and the eye says which way it goes", async () => {
    const user = userEvent.setup();
    const { container } = render(<Blocks />);
    await user.click(screen.getByRole("button", { name: t.hideBlock("Tabela") }));
    const show = screen.getByRole("button", { name: t.showBlock("Tabela") });
    expect(show).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll("[data-hidden]")).toHaveLength(1);
    await expectAccessible(container);
  });
});

function Filters({ onChange }: { onChange: (id: string, value: string | null) => void }) {
  const [values, setValues] = useState<Record<string, string | null>>({ classe: null, fonte: null });
  const fields: FilterField[] = [
    {
      id: "classe",
      label: "Classe",
      pinned: true,
      value: values.classe ?? null,
      options: [
        { value: "metais", label: "Metais" },
        { value: "polimeros", label: "Polímeros" },
      ],
    },
    {
      id: "fonte",
      label: "Fonte",
      value: values.fonte ?? null,
      options: [{ value: "demo", label: "Demonstração" }],
    },
  ];
  return (
    <FilterBar
      fields={fields}
      onChange={(id, value) => {
        onChange(id, value);
        setValues((v) => ({ ...v, [id]: value }));
      }}
      onClear={() => setValues({ classe: null, fonte: null })}
    />
  );
}

describe("FilterBar (D-206)", () => {
  it("writes each pinned field as a chip, unset as 'Qualquer'", async () => {
    const { container } = render(<Filters onChange={() => {}} />);
    expect(screen.getByRole("group", { name: t.filters })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t.filterChip("Classe", t.anyValue) }),
    ).toBeInTheDocument();
    // The unpinned field waits in "+ Filtro", not on the bar.
    expect(screen.queryByRole("button", { name: /^Fonte:/ })).toBeNull();
    await expectAccessible(container);
  });

  it("reports the picked value, then shows it on the chip with a way to clear", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Filters onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: t.filterChip("Classe", t.anyValue) }));
    await user.click(screen.getByRole("button", { name: "Metais" }));
    expect(onChange).toHaveBeenCalledWith("classe", "metais");
    expect(screen.getByRole("button", { name: t.filterChip("Classe", "Metais") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.clearFilters }));
    expect(screen.getByRole("button", { name: t.filterChip("Classe", t.anyValue) })).toBeInTheDocument();
  });

  it("brings a field onto the bar from '+ Filtro', and removing it takes it off", async () => {
    const user = userEvent.setup();
    render(<Filters onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: t.addFilterMenu }));
    await user.click(screen.getByRole("button", { name: "Fonte" }));
    expect(screen.getByRole("button", { name: t.filterChip("Fonte", t.anyValue) })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.removeFilter("Fonte") }));
    expect(screen.queryByRole("button", { name: /^Fonte:/ })).toBeNull();
  });
});

describe("PropertyList (D-206)", () => {
  it("is a description list of name and value, with the aside and hint in the value", async () => {
    const { container } = render(
      <PropertyList
        items={[
          { label: "Densidade", value: "7,85 g/cm³", aside: <span>Verificado</span> },
          { label: "Módulo de Young", value: "200 GPa", hint: "a 20 °C" },
        ]}
      />,
    );
    const terms = container.querySelectorAll("dt");
    const defs = container.querySelectorAll("dd");
    expect([...terms].map((d) => d.textContent)).toEqual(["Densidade", "Módulo de Young"]);
    expect(defs[0]?.textContent).toContain("Verificado");
    expect(defs[1]?.textContent).toContain("a 20 °C");
    await expectAccessible(container);
  });
});

describe("PageDoc (D-206)", () => {
  it("keeps the h1 and edits the title in place: Enter commits, Escape restores", async () => {
    const user = userEvent.setup();
    const onTitle = vi.fn();
    const { container } = render(
      <PageDoc
        title="Viga leve"
        onTitleChange={onTitle}
        menu={<MenuItem onSelect={() => {}}>Duplicar</MenuItem>}
      >
        <p>Corpo</p>
      </PageDoc>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const field = screen.getByRole("textbox", { name: t.titleLabel });
    await user.clear(field);
    await user.type(field, "Viga rígida{Enter}");
    expect(onTitle).toHaveBeenCalledWith("Viga rígida");

    await user.type(field, " X");
    await user.keyboard("{Escape}");
    expect(field).toHaveValue("Viga leve");

    expect(screen.getByRole("button", { name: t.moreActions })).toBeInTheDocument();
    await expectAccessible(container);
  });

  it("never commits an empty title", async () => {
    const user = userEvent.setup();
    const onTitle = vi.fn();
    render(<PageDoc title="Viga leve" onTitleChange={onTitle} />);
    const field = screen.getByRole("textbox", { name: t.titleLabel });
    await user.clear(field);
    await user.tab();
    expect(onTitle).not.toHaveBeenCalled();
    expect(field).toHaveValue("Viga leve");
  });
});

describe("EmptyState v2 (D-206)", () => {
  it("as a page, offers starting points as links and buttons", async () => {
    const user = userEvent.setup();
    const pick = vi.fn();
    const { container } = render(
      <EmptyState
        layout="page"
        title="Nenhum estudo ainda"
        description="Um estudo guarda função, restrições e objetivo."
        templates={[
          { label: "Viga leve e rígida", href: "/app/selecao?funcao=viga" },
          { label: "Painel barato", description: "Custo por rigidez", onSelect: pick },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Nenhum estudo ainda" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Viga leve e rígida/ })).toHaveAttribute(
      "href",
      "/app/selecao?funcao=viga",
    );
    await user.click(screen.getByRole("button", { name: /Painel barato/ }));
    expect(pick).toHaveBeenCalled();
    await expectAccessible(container);
  });
});

describe("SidePeek (D-206)", () => {
  it("is a modal named by its title, with the way to the full page, closed by Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SidePeek open title="Aço 1020" onClose={onClose} openHref="/app/materiais/7">
        <p>Ficha</p>
      </SidePeek>,
    );
    const dialog = screen.getByRole("dialog", { name: "Aço 1020" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("link", { name: t.sidePeekOpen })).toHaveAttribute(
      "href",
      "/app/materiais/7",
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    await expectAccessible(dialog);
  });

  it("renders nothing while closed", () => {
    render(
      <SidePeek open={false} title="Aço 1020" onClose={() => {}}>
        <p>Ficha</p>
      </SidePeek>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Workbench (D-206)", () => {
  it("names its two regions and folds the method under the result", async () => {
    const { container } = render(
      <Workbench
        inputs={<label>Comprimento (m)<input /></label>}
        result={<p>Massa: 1,2 kg</p>}
        method={<p>m = ρ · A · L</p>}
      />,
    );
    expect(screen.getByRole("region", { name: t.workbenchInputs })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: t.workbenchResult })).toBeInTheDocument();
    expect(screen.getByText(t.workbenchMethod)).toBeInTheDocument();
    await expectAccessible(container);
  });
});
