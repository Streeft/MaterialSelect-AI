import { afterEach, describe, expect, it } from "vitest";
import { EDGE_MAX_SPEED, EDGE_ZONE, edgeScrollDelta, scrollParent, scrollSpan } from "./autoScroll";

describe("edgeScrollDelta (D-249)", () => {
  it("does nothing in the middle of the area", () => {
    expect(edgeScrollDelta(400, 0, 800)).toBe(0);
    expect(edgeScrollDelta(EDGE_ZONE, 0, 800)).toBe(0);
    expect(edgeScrollDelta(800 - EDGE_ZONE, 0, 800)).toBe(0);
  });

  it("scrolls up near the top and down near the bottom", () => {
    expect(edgeScrollDelta(10, 0, 800)).toBeLessThan(0);
    expect(edgeScrollDelta(790, 0, 800)).toBeGreaterThan(0);
  });

  it("is faster the closer to the edge, and never beyond the top speed", () => {
    const slow = edgeScrollDelta(EDGE_ZONE - 8, 0, 800);
    const mid = edgeScrollDelta(EDGE_ZONE / 2, 0, 800);
    const fast = edgeScrollDelta(0, 0, 800);
    expect(Math.abs(slow)).toBeLessThan(Math.abs(mid));
    expect(Math.abs(mid)).toBeLessThan(Math.abs(fast));
    expect(fast).toBe(-EDGE_MAX_SPEED);
    // A finger dragged past the edge of the screen keeps scrolling at the top speed.
    expect(edgeScrollDelta(-300, 0, 800)).toBe(-EDGE_MAX_SPEED);
    expect(edgeScrollDelta(2000, 0, 800)).toBe(EDGE_MAX_SPEED);
  });

  it("always moves at least one pixel inside the zone, so it never stalls", () => {
    expect(edgeScrollDelta(EDGE_ZONE - 1, 0, 800)).toBe(-1);
    expect(edgeScrollDelta(800 - EDGE_ZONE + 1, 0, 800)).toBe(1);
  });

  it("works against an area that does not start at zero", () => {
    expect(edgeScrollDelta(210, 200, 600)).toBeLessThan(0);
    expect(edgeScrollDelta(590, 200, 600)).toBeGreaterThan(0);
    expect(edgeScrollDelta(400, 200, 600)).toBe(0);
  });

  it("a short area has no dead middle and an empty one does nothing", () => {
    expect(edgeScrollDelta(10, 0, 100)).toBeLessThan(0);
    expect(edgeScrollDelta(90, 0, 100)).toBeGreaterThan(0);
    expect(edgeScrollDelta(5, 0, 0)).toBe(0);
    expect(edgeScrollDelta(5, 50, 10)).toBe(0);
  });
});

describe("scrollParent and scrollSpan", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds the nearest ancestor that scrolls vertically", () => {
    document.body.innerHTML =
      '<div id="outer" style="overflow-y:auto"><div id="inner" style="overflow-y:auto"><p id="leaf"></p></div></div>';
    const outer = document.getElementById("outer")!;
    const inner = document.getElementById("inner")!;
    for (const box of [outer, inner]) {
      Object.defineProperty(box, "scrollHeight", { value: 900, configurable: true });
      Object.defineProperty(box, "clientHeight", { value: 300, configurable: true });
    }
    expect(scrollParent(document.getElementById("leaf"))).toBe(inner);
  });

  it("skips a box that has overflow set but nothing to scroll, and falls back to the page", () => {
    document.body.innerHTML = '<div id="box" style="overflow-y:auto"><p id="leaf"></p></div>';
    // jsdom lays nothing out: scrollHeight and clientHeight are both 0.
    expect(scrollParent(document.getElementById("leaf"))).toBeNull();
    expect(scrollParent(null)).toBeNull();
  });

  it("the page's span is the viewport; a box's is cut to what is on screen", () => {
    expect(scrollSpan(null)).toEqual([0, window.innerHeight]);
    const box = document.createElement("div");
    box.getBoundingClientRect = () =>
      ({ top: -50, bottom: window.innerHeight + 200 }) as DOMRect;
    expect(scrollSpan(box)).toEqual([0, window.innerHeight]);
  });
});
