import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { Popover } from "./Popover";

let windowClass = "compact";
vi.mock("@/lib/useWindowClass", () => ({ useWindowClass: () => windowClass }));

function renderPopover() {
  return render(
    <Popover label="Ver a proveniência deste valor" title="Densidade" trigger={<span>7,85 g/cm³</span>}>
      <p>Fonte: Dataset de demonstração</p>
      <a href="/fonte">Abrir a fonte</a>
    </Popover>,
  );
}

afterEach(() => {
  windowClass = "compact";
  document.body.style.overflow = "";
});

describe("Popover vira folha inferior no celular (D-197)", () => {
  it("opens a modal sheet headed by what the value is, with focus inside", async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole("button", { name: "Ver a proveniência deste valor" }));
    const sheet = screen.getByRole("dialog", { name: "Densidade" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toHaveFocus();
    expect(within(sheet).getByText("Fonte: Dataset de demonstração")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("keeps Tab inside, closes on Escape and gives focus back to the value", async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByRole("button", { name: "Ver a proveniência deste valor" });
    await user.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "Densidade" });
    await user.tab();
    expect(within(sheet).getByRole("button", { name: ptBR.ui.close })).toHaveFocus();
    await user.tab();
    expect(within(sheet).getByRole("link", { name: "Abrir a fonte" })).toHaveFocus();
    await user.tab();
    expect(within(sheet).getByRole("button", { name: ptBR.ui.close })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes from its button and from a tap on the scrim", async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByRole("button", { name: "Ver a proveniência deste valor" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: ptBR.ui.close }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(document.querySelector(".m3-sheet-scrim")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays the anchored panel on a wider window", async () => {
    windowClass = "medium";
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole("button", { name: "Ver a proveniência deste valor" }));
    const panel = screen.getByRole("dialog", { name: "Ver a proveniência deste valor" });
    expect(panel).not.toHaveAttribute("aria-modal");
    expect(document.querySelector(".m3-bottom-sheet")).toBeNull();
  });

  it("has no accessibility violations while open", async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole("button", { name: "Ver a proveniência deste valor" }));
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
