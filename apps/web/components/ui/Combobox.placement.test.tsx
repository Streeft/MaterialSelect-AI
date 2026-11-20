import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox } from "./Combobox";

const OPTIONS = ["Aço", "Alumínio", "Cobre", "Pinho", "Titânio"].map((label, i) => ({ value: String(i), label }));

/** jsdom lays nothing out: the field's box and the viewport's height are given here. */
function fieldAt(top: number, viewport: number) {
  vi.spyOn(HTMLInputElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + 40,
    left: 100,
    right: 400,
    width: 300,
    height: 40,
    x: 100,
    y: top,
    toJSON: () => ({}),
  });
  Object.defineProperty(window, "innerHeight", { value: viewport, configurable: true });
}

async function openList() {
  const user = userEvent.setup();
  render(<Combobox label="Material" options={OPTIONS} value="" onChange={() => undefined} />);
  await user.click(screen.getByRole("combobox", { name: "Material" }));
  return screen.getByRole("listbox");
}

afterEach(() => vi.restoreAllMocks());

/**
 * D-261: the list is fixed to the viewport, so it must fit in it. Found by the browser suite: a
 * material field low on a long page opened options below the screen's edge, where no pointer
 * reaches them.
 */
describe("Combobox: a lista cabe na tela", () => {
  it("com espaço abaixo, abre abaixo com a altura cheia", async () => {
    fieldAt(100, 900);
    const list = await openList();
    expect(list.style.top).toBe("144px");
    expect(list.style.bottom).toBe("");
    expect(list.style.maxHeight).toBe("280px");
  });

  it("com pouco espaço abaixo e mais acima, abre para cima e não passa do topo", async () => {
    fieldAt(800, 900);
    const list = await openList();
    // 900 - 800 + 4: the list's bottom edge sits just above the field.
    expect(list.style.bottom).toBe("104px");
    expect(list.style.top).toBe("");
    expect(list.style.maxHeight).toBe("280px");
  });

  it("espremida, encolhe até caber em vez de sair da tela", async () => {
    fieldAt(100, 360);
    const list = await openList();
    // 360 - 140 - 4 - 8 = 208 px under the field.
    expect(list.style.top).toBe("144px");
    expect(list.style.maxHeight).toBe("208px");
  });

  it("sem espaço em lado nenhum, ainda mostra umas duas opções", async () => {
    fieldAt(60, 150);
    const list = await openList();
    expect(list.style.maxHeight).toBe("96px");
  });
});
