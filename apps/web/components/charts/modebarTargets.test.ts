import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const figures = readFileSync(resolve(__dirname, "figures.css"), "utf8");
const globals = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

/** The body of the `@media (pointer: coarse)` block that holds the modebar rules. */
function coarseModebarBlock(): string {
  const start = figures.indexOf("@media (pointer: coarse) {\n  .chart-plotly .modebar-btn");
  expect(start, "figures.css has the coarse-pointer modebar block").toBeGreaterThan(-1);
  // The block ends at the first line that is only a closing brace in column 0.
  return figures.slice(start, figures.indexOf("\n}\n", start) + 3);
}

describe("the Plotly modebar's touch targets (D-249, closing D-226)", () => {
  it("grows every modebar button to the 44 px target on a coarse pointer", () => {
    const block = coarseModebarBlock();
    expect(block).toMatch(/min-width: var\(--target-min, 44px\) !important/);
    expect(block).toMatch(/height: var\(--target-min, 44px\) !important/);
    // Plotly injects `padding: 3px 4px` and a 22 px height one class more specific than ours:
    // without `!important` the override would silently lose.
    expect(block).toMatch(/padding: 0 !important/);
  });

  it("keeps Plotly's compact bar on a fine pointer", () => {
    const outside = figures.replace(coarseModebarBlock(), "");
    expect(outside).not.toMatch(/\.modebar-btn[^{]*\{[^}]*height/);
  });

  it("takes its size from the design token, which is 44 px", () => {
    expect(globals).toMatch(/--target-min: 44px;/);
  });

  it("is the app's one way to cover the modebar: no hit area is laid over its neighbours", () => {
    // The shared `::after` rule of D-226 must keep leaving the modebar alone: its buttons are a
    // row of boxes, and an overlapping hit area would send a tap to the wrong tool.
    expect(globals).toMatch(/button:not\([^)]*\.modebar-btn[^)]*\)::after/);
    expect(globals).toMatch(/:where\(button, a\[href\], summary\):not\(\.modebar \*\)/);
  });
});
