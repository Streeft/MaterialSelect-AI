import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiField, fieldsFor, revealField } from "./revealField";

describe("lib/ai/revealField (D-230)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="panel">Sugestão da IA</button>
      <input id="a" data-ai-field="recycled_fraction" />
      <input id="b" data-ai-field="recycled_fraction" />
      <input id="c" data-ai-field="inputs.comprimento" />`;
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("marks a control by the server's parameter name", () => {
    expect(aiField("batch_size")).toEqual({ "data-ai-field": "batch_size" });
  });

  it("finds every control of a name, and nothing for a name that is not plain", () => {
    expect(fieldsFor("recycled_fraction").map((el) => el.id)).toEqual(["a", "b"]);
    expect(fieldsFor("inputs.comprimento").map((el) => el.id)).toEqual(["c"]);
    expect(fieldsFor('x"] , body , [x="')).toEqual([]);
    expect(fieldsFor("nao_existe")).toEqual([]);
  });

  it("rings every control for a moment and then lets go", () => {
    revealField("recycled_fraction");
    vi.advanceTimersByTime(100);
    expect(document.getElementById("a")).toHaveAttribute("data-ai-changed", "true");
    expect(document.getElementById("b")).toHaveAttribute("data-ai-changed", "true");
    expect(document.getElementById("c")).not.toHaveAttribute("data-ai-changed");
    vi.advanceTimersByTime(3000);
    expect(document.getElementById("a")).not.toHaveAttribute("data-ai-changed");
  });

  it("leaves the focus where it is, unless it would be lost", () => {
    const panel = document.getElementById("panel") as HTMLButtonElement;
    panel.focus();
    revealField("inputs.comprimento");
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(panel);

    // The panel folded and took the focus with it: the changed field has it now.
    panel.blur();
    revealField("inputs.comprimento");
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(document.getElementById("c"));
  });
});
