import { describe, expect, it } from "vitest";
import {
  DENSE_FROM,
  barAt,
  barMetrics,
  lineOpacity,
  lineWidth,
  parallelHeight,
} from "./comparisonDensity";

describe("comparison figure density (D-187)", () => {
  it("keeps the bars as they were up to twelve, then holds a minimum thickness", () => {
    expect(barMetrics(3).bar).toBe(14);
    expect(barMetrics(12).bar).toBe(9);
    expect(barMetrics(200)).toEqual({ bar: 3, gap: 1 });
    expect(barMetrics(10_000).bar).toBeGreaterThanOrEqual(3);
  });

  it("fades a line with the count but never makes it invisible", () => {
    expect(lineOpacity(DENSE_FROM)).toBe(0.9);
    expect(lineOpacity(200)).toBeLessThan(lineOpacity(60));
    expect(lineOpacity(100_000)).toBe(0.1);
    expect(lineWidth(DENSE_FROM)).toBe(2);
    expect(lineWidth(DENSE_FROM + 1)).toBe(1);
  });

  it("grows the parallel plot with the count, up to a cap", () => {
    expect(parallelHeight(10)).toBe(340);
    expect(parallelHeight(200)).toBeGreaterThan(parallelHeight(100));
    expect(parallelHeight(100_000)).toBe(760);
  });

  it("finds the bar under a vertical offset, and nothing in the gap", () => {
    const layout = { top: 4, groupHeight: 4 * 5 - 1, groupGap: 16, groups: 3, rows: 4, bar: 4, gap: 1 };
    expect(barAt(4, layout)).toEqual({ group: 0, row: 0 });
    expect(barAt(4 + 5, layout)).toEqual({ group: 0, row: 1 });
    expect(barAt(4 + 19, layout)).toEqual({ group: 0, row: 3 });
    expect(barAt(4 + 19 + 4, layout)).toBeNull(); // the gap between groups
    expect(barAt(4 + 35, layout)).toEqual({ group: 1, row: 0 });
    expect(barAt(2, layout)).toBeNull();
    expect(barAt(10_000, layout)).toBeNull();
  });
});
