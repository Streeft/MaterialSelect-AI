import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { M3ExpressiveSpecimens } from "./M3ExpressiveSpecimens";

describe("M3 Expressive specimens (D-252b)", () => {
  it("mostra cada papel nas duas formas, sem violação de acessibilidade", async () => {
    const { container } = render(<M3ExpressiveSpecimens />);
    expect(container.querySelector(".text-m3-title-small-emphasized")).not.toBeNull();
    expect(container.querySelector(".text-m3-body-large-emphasized")).not.toBeNull();
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("o menu marca a opção atual como menuitemradio escolhido", async () => {
    const user = userEvent.setup();
    render(<M3ExpressiveSpecimens />);
    await user.click(screen.getByRole("button", { name: "Ordenar: Nome" }));
    expect(screen.getByRole("menuitemradio", { name: "Nome" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Classe" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("menuitemradio", { name: "Classe" }));
    expect(screen.getByRole("button", { name: "Ordenar: Classe" })).toBeInTheDocument();
  });

  it("a aba guarda a largura da forma enfatizada no rótulo", () => {
    render(<M3ExpressiveSpecimens />);
    const label = screen.getByRole("tab", { name: "Resumo" }).querySelector(".m3-emph-label");
    expect(label?.getAttribute("data-text")).toBe("Resumo");
  });
});
