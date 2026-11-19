import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setAmbience } from "@/lib/ambience";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { WorkshopSpecimens } from "./WorkshopSpecimens";

afterEach(() => {
  act(() => setAmbience("engenharia"));
  window.localStorage.clear();
});

describe("Oficina specimens (D-256)", () => {
  it("mostra as peças sem violação de acessibilidade", async () => {
    const { container } = render(<WorkshopSpecimens />);
    expect(screen.getByRole("link", { name: "Material de exemplo A" })).toBeInTheDocument();
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("a chave de ambiente veste o documento", async () => {
    const user = userEvent.setup();
    render(<WorkshopSpecimens />);
    await user.click(screen.getByRole("button", { name: "Oficina" }));
    expect(document.documentElement.dataset.ambience).toBe("oficina");
  });

  it("a gaveta é um botão que abre e fecha a sua região", async () => {
    const user = userEvent.setup();
    render(<WorkshopSpecimens />);
    const front = screen.getByRole("button", { name: /Família de exemplo/ });
    expect(front).toHaveAttribute("aria-expanded", "true");
    await user.click(front);
    expect(front).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Material de exemplo A" })).not.toBeInTheDocument();
  });
});
