import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { MAX_COMPARE_MATERIALS } from "@/lib/compareLimits";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { MaterialGallery, MaterialList } from "./MaterialList";

const t = ptBR.catalog;
const quality = { medido: 1, importado: 0, estimado: 0, missing: 0 };

function material(id: number, name: string): MaterialListItem {
  return {
    id,
    name,
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    is_demo: false,
    is_own_record: false,
    keywords: [],
    designations: [],
    quality,
  };
}
const LIST = [material(1, "Zinco"), material(2, "Aço 1020"), material(3, "Alumina")];

/** The page owns the selection (D-232); this stands in for the catalogue's address state. */
function Harness({ initial = [], gallery = false }: { initial?: number[]; gallery?: boolean }) {
  const [ids, setIds] = useState<number[]>(initial);
  const selection = { ids, onChange: setIds };
  return (
    <>
      <output data-testid="ids">{ids.join(",")}</output>
      {gallery ? (
        <MaterialGallery materials={LIST} selection={selection} />
      ) : (
        <MaterialList materials={LIST} selection={selection} />
      )}
    </>
  );
}

const cards = () => screen.getAllByRole("list")[0]!;
const barStatus = () =>
  within(screen.getByRole("region", { name: t.selectionBar })).getByRole("status");

describe("seleção nos cartões do celular (D-254)", () => {
  it("cada cartão tem sua caixa, nomeada pelo material, e marcar acende a barra única", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = within(cards()).getByRole("checkbox", { name: t.selectRow("Zinco") });
    expect(box).not.toBeChecked();
    expect(screen.queryByRole("region", { name: t.selectionBar })).toBeNull();

    await user.click(box);
    expect(box).toBeChecked();
    expect(screen.getByTestId("ids")).toHaveTextContent("1");
    // Cards and table are both in the DOM (the breakpoint hides one): one bar, not two.
    expect(screen.getAllByRole("region", { name: t.selectionBar })).toHaveLength(1);
    expect(barStatus()).toHaveTextContent(t.selectedCount(1));
  });

  it("a caixa do cartão e a da tabela são a mesma seleção", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const table = screen.getByRole("table");
    await user.click(within(cards()).getByRole("checkbox", { name: t.selectRow("Zinco") }));
    expect(within(table).getByRole("checkbox", { name: t.selectRow("Zinco") })).toBeChecked();
    await user.click(within(table).getByRole("checkbox", { name: t.selectRow("Alumina") }));
    expect(within(cards()).getByRole("checkbox", { name: t.selectRow("Alumina") })).toBeChecked();
    expect(screen.getByTestId("ids")).toHaveTextContent("1,3");
    await user.click(within(cards()).getByRole("checkbox", { name: t.selectRow("Zinco") }));
    expect(within(table).getByRole("checkbox", { name: t.selectRow("Zinco") })).not.toBeChecked();
    expect(screen.getByTestId("ids")).toHaveTextContent("3");
  });

  it("a barra mostra Comparar só com dois ou mais, abre na Seleção e limpa", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[1]} />);
    const bar = screen.getByRole("region", { name: t.selectionBar });
    expect(within(bar).getByRole("button", { name: t.compareSelected })).toBeDisabled();
    expect(within(bar).getByText(t.compareNeedsTwo)).toBeInTheDocument();

    await user.click(within(cards()).getByRole("checkbox", { name: t.selectRow("Aço 1020") }));
    expect(within(bar).getByRole("link", { name: t.compareSelected })).toHaveAttribute(
      "href",
      "/app/comparar?materiais=1,2",
    );
    expect(within(bar).getByRole("link", { name: t.openInSelection })).toHaveAttribute(
      "href",
      "/app/selecao?etapa=restricoes&materiais=1,2",
    );

    await user.click(within(bar).getByRole("button", { name: t.clearSelection }));
    expect(screen.queryByRole("region", { name: t.selectionBar })).toBeNull();
    expect(screen.getByTestId("ids")).toHaveTextContent("");
  });

  it("diz que há marcados em outras páginas quando a seleção tem mais do que a página mostra", () => {
    render(<Harness initial={[1, 99]} />);
    expect(barStatus()).toHaveTextContent(t.selectedAcrossPages(2));
  });

  it("recusa Comparar acima do limite e diz o limite", () => {
    const many = Array.from({ length: MAX_COMPARE_MATERIALS + 1 }, (_, i) => i + 1);
    render(<Harness initial={many} />);
    expect(screen.getByText(t.compareTooMany(MAX_COMPARE_MATERIALS))).toBeInTheDocument();
  });

  it("a galeria tem as mesmas caixas e a mesma barra", async () => {
    const user = userEvent.setup();
    render(<Harness gallery />);
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: t.selectRow("Alumina") }));
    expect(screen.getByRole("region", { name: t.selectionBar })).toBeInTheDocument();
    expect(screen.getByTestId("ids")).toHaveTextContent("3");
  });

  it("sem seleção do dono da página, os cartões continuam sem caixa", () => {
    render(<MaterialList materials={LIST} />);
    expect(within(cards()).queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("cartões, tabela e barra não têm violações de acessibilidade", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initial={[1]} />);
    await user.click(within(cards()).getByRole("checkbox", { name: t.selectRow("Aço 1020") }));
    const violations = await findA11yViolations(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
