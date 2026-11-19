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
    // D-248: indented lines too, so the rules inside `@media (hover: hover)` are read.
    const hover = css.split("\n").filter((l) => /^\s*\.msds-(btn|chip|fab)(?!menu)[\w-]*:hover/.test(l));
    expect(hover.length).toBeGreaterThan(4);
    for (const line of hover) {
      expect(line, line).not.toMatch(/transform|translate|scale|border-color|filter|box-shadow: var\(--shadow-lift/);
    }
  });

  it("D-248: hover changes the shape only, on the fast spatial spring; press squares it", () => {
    const morph = css.slice(css.indexOf("D-248: shape that answers the pointer"));
    expect(morph).toContain(".msds-btn-md:hover:not(:disabled) { --btn-r: var(--shape-large-increased); }");
    expect(morph).toContain(".msds-icon-btn:hover:not(:disabled) { border-radius: var(--shape-medium); }");
    expect(morph).toMatch(/\.msds-btn:active:not\(:disabled\),\n\.msds-btn\[data-force-state="pressed"\] \{ --btn-r: var\(--radius-seat\); \}/);
    expect(morph).toContain("border-radius var(--motion-spatial-fast-dur) var(--motion-spatial-fast)");
    // A selected toggle is square where the resting one is round.
    expect(morph).toContain('.msds-icon-btn { border-radius: 50%; }');
    expect(morph).toContain('.msds-icon-btn[aria-pressed="true"] { border-radius: var(--shape-medium); }');
    expect(morph).toContain('.msds-chip[aria-pressed="true"] { border-radius: var(--shape-small); }');
    expect(morph).toMatch(/prefers-reduced-motion: reduce\) \{\n {2}\.msds-btn, \.msds-icon-btn, \.msds-chip, \.msds-fab \{ transition: none; \}/);
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
