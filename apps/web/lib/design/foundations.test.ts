import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-206: the F1 foundations, held by a test so they cannot erode one PR at a
 * time. Three rules, all read from the source rather than a rendered page:
 *
 * 1. Text size comes from a role (D-91). `text-xs`/`text-sm` were the two
 *    sizes a component reached for by habit (397 uses); they became
 *    `text-caption`/`text-body`. The numeric steps that remain (`text-base`,
 *    `-lg`, `-xl`, `-2xl`) are sized by fit — a glyph, a page title — and are
 *    held at today's count: a new one is a decision, not a habit.
 * 2. Hover is a veil, not a border (D-134). The one exception is the M3
 *    outlined text field, whose spec darkens the outline on hover.
 * 3. A touch screen gets a hit area of `--target-min` (≥ 44 px) around every
 *    button, icon button and chip, whatever their drawn size.
 */

const ROOT = resolve(__dirname, "../..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name.startsWith(".next") ? [] : sources(path);
    }
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

function hits(pattern: RegExp): string[] {
  return ["app", "components"].flatMap((dir) =>
    sources(join(ROOT, dir)).flatMap((file) =>
      (readFileSync(file, "utf8").match(pattern) ?? []).map(
        (match) => `${file.slice(ROOT.length + 1)}: ${match.trim()}`,
      ),
    ),
  );
}

describe("foundations (D-206)", () => {
  it("never sizes text with text-xs or text-sm: those are the caption and body roles", () => {
    expect(hits(/(?<![\w-])text-(?:xs|sm)(?![\w-])/g)).toEqual([]);
  });

  it("holds the remaining numeric text sizes at their measured count", () => {
    // Measured on 11/11/2026. Lower it when one goes; raising it is a decision.
    expect(hits(/(?<![\w-])text-(?:base|lg|xl|2xl|3xl)(?![\w-])/g).length).toBeLessThanOrEqual(44);
  });

  it("answers hover with the state veil, never with a border colour, outside the text field", () => {
    const borderHovers = hits(/hover:border-[\w-]+/g).filter(
      (hit) => !hit.startsWith("components/ui/Field.tsx"),
    );
    expect(borderHovers).toEqual([]);
  });

  it("gives every button, icon button and chip a 44 px hit area on a touch screen", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    const token = css.match(/--target-min:\s*(\d+)px/);
    expect(Number(token?.[1])).toBeGreaterThanOrEqual(44);

    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    for (const selector of [".msds-btn::after", ".msds-icon-btn::after", ".msds-chip::after"]) {
      expect(coarse).toContain(selector);
    }
    expect(coarse).toMatch(/width:\s*max\(100%,\s*var\(--target-min\)\)/);
    expect(coarse).toMatch(/height:\s*max\(100%,\s*var\(--target-min\)\)/);
  });
});
