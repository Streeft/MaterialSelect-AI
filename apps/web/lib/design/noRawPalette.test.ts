import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// "Cor só via token" (D-28): a Tailwind default-palette class such as
// `bg-amber-600` skips globals.css and palette.ts, so interface and figure can
// disagree and contrast is never measured.
const RAW_PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === ".next" ? [] : sources(path);
    }
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("no raw palette classes (C4)", () => {
  it("components, app and lib use tokens only", () => {
    const root = resolve(__dirname, "../..");
    const hits = ["components", "app", "lib"].flatMap((dir) =>
      sources(join(root, dir)).flatMap((file) =>
        (readFileSync(file, "utf8").match(RAW_PALETTE) ?? []).map(
          (match) => `${file.slice(root.length + 1)}: ${match}`,
        ),
      ),
    );
    expect(hits).toEqual([]);
  });
});
