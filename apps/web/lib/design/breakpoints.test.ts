import { describe, expect, it } from "vitest";
import { BREAKPOINT_MIN, WINDOW_CLASSES, atLeast, mediaQueryFor, windowClassFor } from "./breakpoints";

describe("breakpoints M3 (D-182)", () => {
  it("usa os cinco limites da página do M3", () => {
    expect(BREAKPOINT_MIN).toEqual({ compact: 0, medium: 600, expanded: 840, large: 1200, extraLarge: 1600 });
  });

  it.each([
    [0, "compact"],
    [375, "compact"],
    [599, "compact"],
    [600, "medium"],
    [839, "medium"],
    [840, "expanded"],
    [1199, "expanded"],
    [1200, "large"],
    [1599, "large"],
    [1600, "extraLarge"],
    [2560, "extraLarge"],
  ] as const)("%i px é %s", (width, expected) => {
    expect(windowClassFor(width)).toBe(expected);
  });

  it("atLeast compara pela ordem das classes", () => {
    expect(atLeast("large", "expanded")).toBe(true);
    expect(atLeast("expanded", "expanded")).toBe(true);
    expect(atLeast("medium", "expanded")).toBe(false);
  });

  it("cada classe tem a media query do seu limite inferior", () => {
    for (const name of WINDOW_CLASSES) {
      expect(mediaQueryFor(name)).toBe(`(min-width: ${BREAKPOINT_MIN[name]}px)`);
    }
  });
});
