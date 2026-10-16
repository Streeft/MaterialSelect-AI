import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "msds.css"), "utf8");

/** D-134: buttons, chips and the FAB answer hover with the M3 veil, not with movement. */
describe("MSDS state layer (D-134)", () => {
  it("reads the M3 state tokens instead of literal opacities", () => {
    expect(css).toContain(".msds-ripple-host:hover .msds-state-layer { opacity: var(--state-hover); }");
    expect(css).toContain("opacity: var(--state-pressed)");
    expect(css).not.toMatch(/\.msds-state-layer \{ opacity: 0\.0?6/);
  });

  it("no button, chip or FAB variant moves or changes border on hover", () => {
    const hover = css.split("\n").filter((l) => /^\.msds-(btn|chip|fab)(?!menu)[\w-]*:hover/.test(l));
    for (const line of hover) {
      expect(line, line).not.toMatch(/transform|border-color|filter/);
    }
  });

  it("has a tonal variant on the secondary container", () => {
    expect(css).toMatch(/\.msds-btn-tonal \{ background: rgb\(var\(--m3-secondary-container\)\)/);
  });

  it("FAB is 16 px round and takes the route's primary container", () => {
    const fab = /\.msds-fab \{[^}]*\}/.exec(css)![0];
    expect(fab).toContain("border-radius: var(--shape-large)");
    expect(fab).toContain("rgb(var(--m3-primary-container))");
  });
});
