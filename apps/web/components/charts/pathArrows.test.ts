import { describe, expect, it } from "vitest";
import { arrowsAlong } from "./pathArrows";

describe("arrowsAlong (TM4-i)", () => {
  it("has no arrow for a path with fewer than two distinct points", () => {
    expect(arrowsAlong([])).toEqual([]);
    expect(arrowsAlong([[10, 10]])).toEqual([]);
    expect(arrowsAlong([[10, 10], [10, 10]])).toEqual([]);
  });

  it("points along the way the points were declared, not the other way", () => {
    const right = arrowsAlong([[0, 0], [100, 0]], 1000);
    expect(right).toHaveLength(1);
    expect(right[0]!.angle).toBeCloseTo(0);
    const left = arrowsAlong([[100, 0], [0, 0]], 1000);
    expect(left[0]!.angle).toBeCloseTo(180);
    // Screen y grows downward: going to a larger pixel y is a clockwise 90°.
    expect(arrowsAlong([[0, 0], [0, 100]], 1000)[0]!.angle).toBeCloseTo(90);
  });

  it("puts a short path's only arrow at the middle of its length", () => {
    const [arrow] = arrowsAlong([[0, 0], [40, 0]], 96);
    expect(arrow!.x).toBeCloseTo(20);
    expect(arrow!.y).toBeCloseTo(0);
  });

  it("spaces arrows by path length and turns each with its own segment", () => {
    // 100 px right, then 100 px down: arrows every 50 px, the first at 25.
    const arrows = arrowsAlong([[0, 0], [100, 0], [100, 100]], 50);
    expect(arrows.map((a) => [Math.round(a.x), Math.round(a.y)])).toEqual([
      [25, 0],
      [75, 0],
      [100, 25],
      [100, 75],
    ]);
    expect(arrows.map((a) => Math.round(a.angle))).toEqual([0, 0, 90, 90]);
  });

  it("never invents a point: every arrow lies on the polyline", () => {
    const arrows = arrowsAlong([[0, 0], [50, 50], [120, 10], [200, 90]], 30);
    expect(arrows.length).toBeGreaterThan(3);
    for (const a of arrows) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(200);
    }
  });
});
