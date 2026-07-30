import { describe, expect, it } from "vitest";
import {
  CLASS_PALETTE,
  chartFileName,
  classColors,
  toClosedRing,
  toXY,
  withAlpha,
} from "./charts";

describe("classColors", () => {
  it("assigns one palette entry per distinct class", () => {
    const colors = classColors(["metais", "polimeros", "metais"]);
    expect(Object.keys(colors)).toEqual(["metais", "polimeros"]);
    expect(new Set(Object.values(colors)).size).toBe(2);
  });

  it("is stable regardless of the order the classes arrive in", () => {
    expect(classColors(["b", "a", "c"])).toEqual(classColors(["c", "b", "a", "a"]));
  });

  it("cycles the palette when there are more classes than colours", () => {
    const slugs = Array.from({ length: CLASS_PALETTE.length + 2 }, (_, i) => `c${i}`);
    const colors = classColors(slugs);
    expect(Object.keys(colors)).toHaveLength(slugs.length);
    expect(Object.values(colors).every(Boolean)).toBe(true);
  });
});

describe("withAlpha", () => {
  it("converts a hex colour into rgba", () => {
    expect(withAlpha("#2563eb", 0.25)).toBe("rgba(37, 99, 235, 0.25)");
  });
});

describe("toXY", () => {
  it("splits coordinate pairs into parallel arrays", () => {
    expect(toXY([[1, 2], [3, 4]])).toEqual({ xs: [1, 3], ys: [2, 4] });
  });

  it("skips malformed pairs instead of emitting NaN", () => {
    expect(toXY([[1, 2], [3], []])).toEqual({ xs: [1], ys: [2] });
  });

  it("handles an empty polygon", () => {
    expect(toXY([])).toEqual({ xs: [], ys: [] });
  });
});

describe("toClosedRing", () => {
  it("repeats the first vertex so a polygon closes", () => {
    expect(toClosedRing([[0, 0], [1, 0], [1, 1]])).toEqual({
      xs: [0, 1, 1, 0],
      ys: [0, 0, 1, 0],
    });
  });

  it("leaves a degenerate envelope (point or segment) open", () => {
    expect(toClosedRing([[0, 0], [1, 1]])).toEqual({ xs: [0, 1], ys: [0, 1] });
    expect(toClosedRing([[2, 3]])).toEqual({ xs: [2], ys: [3] });
  });
});

describe("chartFileName", () => {
  it("folds accents and collapses separators", () => {
    expect(chartFileName("mapa", "Módulo de Young", "Densidade")).toBe(
      "mapa-modulo-de-young-densidade",
    );
  });

  it("drops empty parts", () => {
    expect(chartFileName("mapa", null, undefined, "  ", "log")).toBe("mapa-log");
  });

  it("falls back to a generic name when nothing usable remains", () => {
    expect(chartFileName("···", null)).toBe("grafico");
  });

  it("never leaves leading or trailing hyphens", () => {
    const name = chartFileName("— Densidade —");
    expect(name).toBe("densidade");
  });
});
