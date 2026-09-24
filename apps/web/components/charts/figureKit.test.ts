import { describe, expect, it } from "vitest";
import { linearTicks, logTicks, makeScale, tok, truncate } from "./figureKit";

describe("tok", () => {
  it("wraps a token in rgb(), the only form an 'R G B' triple is a colour in", () => {
    // A bare var(--edge) as an SVG fill is black — the D-78 defect.
    expect(tok("--edge")).toBe("rgb(var(--edge))");
    expect(tok("--accent", 0.4)).toBe("rgb(var(--accent) / 0.4)");
  });
});

describe("makeScale", () => {
  it("maps a domain onto a pixel range, linearly", () => {
    const x = makeScale([0, 10], [100, 200]);
    expect(x(0)).toBe(100);
    expect(x(5)).toBe(150);
    expect(x(10)).toBe(200);
  });

  it("maps decades to equal distances on a log scale", () => {
    const x = makeScale([1, 1000], [0, 300], true);
    expect(x(10)).toBeCloseTo(100);
    expect(x(100)).toBeCloseTo(200);
  });

  it("flips for a y axis that grows upwards", () => {
    const y = makeScale([0, 1], [300, 0]);
    expect(y(1)).toBe(0);
    expect(y(0.25)).toBe(225);
  });
});

describe("linearTicks", () => {
  it("steps by 1, 2 or 5 × 10ⁿ inside the range", () => {
    expect(linearTicks(0, 868, 5)).toEqual([0, 200, 400, 600, 800]);
    expect(linearTicks(0, 1, 4)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("does not leak float residue into a label", () => {
    for (const tick of linearTicks(0, 0.9, 9)) {
      expect(String(tick).length).toBeLessThan(6);
    }
  });

  it("returns the single value of a degenerate range", () => {
    expect(linearTicks(5, 5)).toEqual([5]);
  });
});

describe("logTicks", () => {
  it("uses powers of ten when the range spans several decades", () => {
    expect(logTicks(0.01, 1000)).toEqual([0.01, 0.1, 1, 10, 100, 1000]);
  });

  it("adds 2× and 5× when too few decades are in view", () => {
    expect(logTicks(3, 60)).toEqual([5, 10, 20, 50]);
  });

  it("refuses a non-positive bound instead of drawing NaN", () => {
    expect(logTicks(0, 10)).toEqual([]);
  });
});

describe("truncate", () => {
  it("keeps short labels and ellipsises long ones", () => {
    expect(truncate("ρ", 10)).toBe("ρ");
    expect(truncate("Energia incorporada (produção primária)", 12)).toBe("Energia inc…");
  });
});
