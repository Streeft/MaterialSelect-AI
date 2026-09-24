import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BIKE_BEAM_EXAMPLE, missingForExample } from "./examples";

/**
 * The example names slugs and units; the seed is where they are defined. Read
 * the Python seed as text (the technique i18n.test.ts uses) so a renamed slug
 * or a dropped unit breaks here, not in front of a class.
 */
const seed = readFileSync(resolve(__dirname, "../../../api/app/db/seed.py"), "utf8");

function acceptedUnitsOf(slug: string): string[] {
  const at = seed.indexOf(`"slug": "${slug}"`);
  expect(at, `slug ${slug} not found in seed.py`).toBeGreaterThan(-1);
  const block = seed.slice(at, at + 1200);
  const match = block.match(/"accepted_units":\s*\[([^\]]*)\]/);
  expect(match, `accepted_units of ${slug}`).not.toBeNull();
  return [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("exemplo da viga de bicicleta", () => {
  it("names an index the seed defines", () => {
    expect(seed).toContain(`"slug": "${BIKE_BEAM_EXAMPLE.indexSlug}"`);
  });

  it("uses only units each property accepts", () => {
    for (const c of BIKE_BEAM_EXAMPLE.constraints) {
      expect(acceptedUnitsOf(c.property_slug ?? "")).toContain(c.unit);
    }
  });

  it("reports what a catalogue lacks instead of loading half an example", () => {
    expect(
      missingForExample(BIKE_BEAM_EXAMPLE, {
        indexSlugs: [],
        propertySlugs: ["modulo_young"],
      }),
    ).toEqual(["viga-leve-rigidez", "limite_escoamento", "temp_max_servico"]);
  });
});
