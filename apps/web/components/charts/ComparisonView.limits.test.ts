import { describe, expect, it } from "vitest";
import { COMPARISON_FIGURE_LIMITS, figureRefusal } from "./ComparisonView";

describe("figureRefusal (TM3)", () => {
  it("draws every view up to its limit", () => {
    expect(figureRefusal("bars", COMPARISON_FIGURE_LIMITS.bars!)).toBeNull();
    expect(figureRefusal("radar", 8)).toBeNull();
  });

  it("says in writing why a crowded figure is not drawn", () => {
    const text = figureRefusal("radar", 9);
    expect(text).toMatch(/até 8 materiais/);
    expect(text).toMatch(/tabela/);
  });

  it("never refuses the table or the heatmap, however many materials", () => {
    expect(figureRefusal("table", 60)).toBeNull();
    expect(figureRefusal("heatmap", 60)).toBeNull();
  });
});
