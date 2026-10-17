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
const rule = (selector: string) => new RegExp(`${selector.replace(/[.[\]"=()]/g, "\\$&")} \\{[^}]*\\}`).exec(css)?.[0] ?? "";

/** Text drawn on the containers the overlays use. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["surface-container", "on-surface"],
  ["surface-container", "on-surface-variant"],
  ["surface-container-high", "on-surface"],
  ["surface-container-high", "on-surface-variant"],
  ["inverse-surface", "inverse-on-surface"],
];

describe("containers and overlays on the M3 roles (D-136)", () => {
  const region = globals.slice(globals.indexOf("/* m3-roles:begin"));
  const blocks = [...region.matchAll(/^([^\n{/][^\n{]*) \{\n([\s\S]*?)\n\}/gm)];

  it.each(blocks.map((m) => [m[1]!, m[2]!] as const))("%s: overlay text reaches 4.5:1", (_sel, body) => {
    const token = (r: string) => new RegExp(`--m3-${r}: (.+);`).exec(body)![1]!;
    for (const [fill, on] of PAIRS) {
      expect(contrast(token(fill), token(on)), `${on} on ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("an interactive card does not move on hover", () => {
    expect(css).not.toMatch(/\.msds-card\[data-interactive="true"\]:hover \{[^}]*transform/);
    expect(css).toContain('.msds-card[data-interactive="true"]:hover { box-shadow: var(--elevation-2); }');
  });

  it("the dialog is 28 px round on container-high, over a 32% scrim", () => {
    const dialog = rule(".msds-dialog");
    expect(dialog).toContain("border-radius: var(--shape-extra-large)");
    expect(dialog).toContain("--m3-surface-container-high");
    expect(css.match(/rgb\(var\(--m3-scrim\) \/ 0\.32\)/g)).toHaveLength(4);
    expect(css).not.toContain("rgba(10,12,16,0.5)");
  });

  it("menu and popover sit on the container role with elevation 2", () => {
    expect(rule(".msds-menu")).toContain("var(--elevation-2)");
    expect(rule(".msds-menu")).toContain("--m3-surface-container");
    expect(rule(".msds-popover")).toContain("var(--elevation-2)");
  });

  it("menu items answer hover with the veil, not a colour change", () => {
    expect(css).toContain(".msds-menu-item:hover:not(:disabled) { background: rgb(var(--m3-on-surface) / var(--state-hover)); }");
  });

  it("snackbar and tooltip are inverse-surface", () => {
    expect(rule(".msds-snackbar")).toContain("--m3-inverse-surface");
    expect(rule(".msds-snackbar")).toContain("var(--elevation-3)");
    expect(rule(".msds-tooltip-bubble")).toContain("--m3-inverse-surface");
  });
});
