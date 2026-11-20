import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { DetailRow, DetailTh, TBody, THead, Table, TableScroll, Td, Th, Tr } from "./Table";

function Example() {
  return (
    <TableScroll label="Custo por processo">
      <Table>
        <THead>
          <Tr>
            <Th>Processo</Th>
            <Th>Total</Th>
            <DetailTh />
          </Tr>
        </THead>
        <TBody>
          <DetailRow name="Fundição em areia" columns={2} details={<p>Ferramental: 1.200</p>}>
            <Td>Fundição em areia</Td>
            <Td>3.400</Td>
          </DetailRow>
          <DetailRow name="Usinagem" columns={2} details={<p>Ferramental: 80</p>}>
            <Td>Usinagem</Td>
            <Td>5.100</Td>
          </DetailRow>
        </TBody>
      </Table>
    </TableScroll>
  );
}

/** D-264: a result row keeps its secondary figures folded, one click away. */
describe("DetailRow", () => {
  it("mostra só as colunas da resposta; o resto abre por linha, com o botão nomeando a linha", async () => {
    const user = userEvent.setup();
    const { container } = render(<Example />);
    // The toggle's column has a name, read aloud and not drawn.
    expect(screen.getByRole("columnheader", { name: ptBR.ui.detailsColumn })).toBeInTheDocument();
    expect(screen.queryByText("Ferramental: 1.200")).toBeNull();

    const toggle = screen.getByRole("button", { name: ptBR.ui.showDetailsOf("Fundição em areia") });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).not.toHaveAttribute("aria-controls");
    await user.click(toggle);

    const opened = screen.getByRole("button", { name: ptBR.ui.hideDetailsOf("Fundição em areia") });
    expect(opened).toHaveAttribute("aria-expanded", "true");
    const detail = document.getElementById(opened.getAttribute("aria-controls")!)!;
    expect(within(detail).getByText("Ferramental: 1.200")).toBeInTheDocument();
    // The details span the whole row, toggle column included.
    expect(detail.querySelector("td")).toHaveAttribute("colspan", "3");
    // One row's details do not open another's.
    expect(screen.queryByText("Ferramental: 80")).toBeNull();

    const found = await findA11yViolations(container);
    expect(found, describeViolations(found)).toEqual([]);

    await user.click(opened);
    expect(screen.queryByText("Ferramental: 1.200")).toBeNull();
  });

  it("abre pelo teclado", async () => {
    const user = userEvent.setup();
    render(<Example />);
    screen.getByRole("button", { name: ptBR.ui.showDetailsOf("Usinagem") }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Ferramental: 80")).toBeInTheDocument();
  });
});
