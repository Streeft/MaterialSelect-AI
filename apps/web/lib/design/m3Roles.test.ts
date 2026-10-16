import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  M3_REGION_BEGIN,
  M3_REGION_END,
  M3_ROLES,
  M3_TEXT_PAIRS,
  buildRouteRoles,
  cssName,
  renderM3Region,
} from "./m3Roles";
import { SECTIONS } from "./sections";

const GLOBALS = resolve(__dirname, "../../app/globals.css");
const SECTION_IDS = SECTIONS.map((s) => s.id).filter((id) => id !== "inicio");

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(rgb: string): number {
  const [r, g, b] = rgb.split(" ").map(Number) as [number, number, number];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Splits the generated region back into `selector -> tokens`. */
function parseRegion(region: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const m of region.matchAll(/^([^\n{/][^\n{]*) \{\n([\s\S]*?)\n\}/gm)) {
    const tokens: Record<string, string> = {};
    for (const line of m[2]!.split("\n")) {
      const t = /^\s+(--[\w-]+): (.+);$/.exec(line);
      if (t) tokens[t[1]!] = t[2]!;
    }
    out.set(m[1]!, tokens);
  }
  return out;
}

describe("M3 roles per route (D-133)", () => {
  const css = readFileSync(GLOBALS, "utf8");
  const begin = css.indexOf(M3_REGION_BEGIN);
  const head = begin >= 0 ? css.slice(0, begin) : css;
  const fresh = renderM3Region(head, SECTION_IDS);

  if (process.env.UPDATE_M3_ROLES) {
    it("rewrites the generated region of globals.css", () => {
      const end = css.indexOf(M3_REGION_END);
      const next =
        begin >= 0 && end > begin
          ? css.slice(0, begin) + fresh + css.slice(end + M3_REGION_END.length)
          : `${css.trimEnd()}\n\n${fresh}\n`;
      writeFileSync(GLOBALS, next);
    });
    return;
  }

  it("matches the region committed in globals.css (run `npm run tokens:m3` if not)", () => {
    const end = css.indexOf(M3_REGION_END);
    expect(begin).toBeGreaterThan(-1);
    expect(css.slice(begin, end + M3_REGION_END.length)).toBe(fresh);
  });

  const blocks = parseRegion(fresh);

  it("emits every role, light and dark, for the default and for all 16 sections", () => {
    expect(blocks.size).toBe(2 * (SECTION_IDS.length + 1));
    for (const tokens of blocks.values()) {
      expect(Object.keys(tokens)).toEqual(M3_ROLES.map(cssName));
      for (const v of Object.values(tokens)) expect(v).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    }
  });

  it("uses the compound selector for dark, never a descendant combinator", () => {
    for (const sel of blocks.keys()) {
      expect(sel).not.toMatch(/\] \[/);
      if (sel.startsWith('[data-theme="dark"]')) expect(sel).not.toContain(" ");
    }
  });

  it.each([...blocks.entries()])("%s: text pairs reach 4.5:1", (_sel, tokens) => {
    for (const [fill, on] of M3_TEXT_PAIRS) {
      const ratio = contrast(tokens[cssName(fill)]!, tokens[cssName(on)]!);
      expect(ratio, `${on} on ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([...blocks.entries()])("%s: control outline reaches 3:1 on the surface", (_sel, tokens) => {
    const ratio = contrast(tokens["--m3-outline"]!, tokens["--m3-surface"]!);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("keeps the hue of the route: different seeds give different primaries", () => {
    const seen = new Set(
      [...blocks.entries()]
        .filter(([sel]) => !sel.startsWith('[data-theme="dark"]'))
        .map(([, t]) => t["--m3-primary"]),
    );
    expect(seen.size).toBeGreaterThan(10);
  });

  it("is deterministic", () => {
    expect(buildRouteRoles("#4567a8", false)).toEqual(buildRouteRoles("#4567a8", false));
  });
});
