import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "msds.css"), "utf8");
const globals = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function lum(rgb: string): number {
  const [r, g, b] = rgb.split(" ").map(Number) as [number, number, number];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The surface a control sits on: `--surface-raised` of each theme (D-34 measures against the panel). */
const PANEL = { light: "255 255 255", dark: "27 30 38" };

describe("form controls on the M3 roles (D-135)", () => {
  const region = globals.slice(globals.indexOf("/* m3-roles:begin"));
  const blocks = [...region.matchAll(/^([^\n{/][^\n{]*) \{\n([\s\S]*?)\n\}/gm)];

  it.each(blocks.map((m) => [m[1]!, m[2]!] as const))(
    "%s: the unchecked border (--m3-outline) reaches 3:1 on the panel",
    (selector, body) => {
      const outline = /--m3-outline: (.+);/.exec(body)![1]!;
      const theme = selector.startsWith('[data-theme="dark"]') ? "dark" : "light";
      expect(contrast(outline, PANEL[theme])).toBeGreaterThanOrEqual(3);
    },
  );

  it("text fields use the 4 px outlined shape and the M3 contour, not the old 10 px box", () => {
    const control = /\.msds-control \{[^}]*\}/.exec(css)![0];
    expect(control).toContain("border-radius: var(--shape-extra-small)");
    expect(control).toContain("rgb(var(--m3-outline))");
    expect(css).toContain(".msds-control:focus-visible");
  });

  it("checked checkbox, radio and switch take primary / on-primary", () => {
    expect(css).toMatch(/\.msds-checkbox input:checked \+ \.msds-checkbox-box \{ background: rgb\(var\(--m3-primary\)\)/);
    expect(css).toMatch(/\.msds-radio input:checked \+ \.msds-radio-dot \{ border-color: rgb\(var\(--m3-primary\)\)/);
    expect(css).toMatch(/\.msds-switch input:checked \+ \.msds-switch-track \{ background: rgb\(var\(--m3-primary\)\)/);
  });

  it("the switch is 52 x 32 with a thumb that grows from 16 to 24 px", () => {
    expect(css).toMatch(/\.msds-switch-track \{[^}]*width: 52px; height: 32px/);
    expect(css).toMatch(/\.msds-switch-thumb \{[^}]*width: 16px; height: 16px/);
    expect(css).toMatch(/:checked \+ \.msds-switch-track \.msds-switch-thumb \{[^}]*width: 24px; height: 24px/);
  });

  it("selection controls get the state halo at the M3 opacities", () => {
    expect(css).toContain(".msds-checkbox:hover .msds-checkbox-box::after");
    expect(css).toContain("opacity: var(--state-hover)");
    expect(css).toContain("opacity: var(--state-pressed)");
  });
});
