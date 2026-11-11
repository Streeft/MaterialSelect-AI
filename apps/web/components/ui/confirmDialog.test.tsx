import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(() => vi.restoreAllMocks());

function setup(open = true) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ConfirmDialog
      open={open}
      title="Excluir esta classe?"
      message="Esta ação não pode ser desfeita."
      confirmLabel="Excluir"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel, view };
}

describe("ConfirmDialog (D-201)", () => {
  it("renders nothing while closed", () => {
    setup(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("confirms only through the explicit button", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    expect(screen.getByRole("dialog", { name: "Excluir esta classe?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels with Cancelar and with Escape without confirming", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("never calls the native window.confirm", async () => {
    const spy = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    setup();
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
