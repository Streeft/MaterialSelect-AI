import type { ConstraintIn } from "@/lib/types";

/**
 * A ready study a student loads with one click (D-85): the lightweight bicycle
 * beam of the usability protocol (docs/11-usabilidade.md §3).
 *
 * These are **input choices** — which index, which thresholds — never material
 * data, so principle 1 is not in play: every number the run prints still comes
 * from the catalogue. It lives in the frontend because it is part of how the
 * screen teaches, and because it needs no API deploy to change. The slugs are
 * checked against the seeded catalogue by `examples.test.ts`, and against the
 * live one by the loader before anything is applied.
 */
export interface SelectionExample {
  name: string;
  functionText: string;
  objectiveText: string;
  freeVariables: string[];
  indexSlug: string;
  constraints: ConstraintIn[];
  criteria: { key: string; weight: string }[];
}

export const BIKE_BEAM_EXAMPLE: SelectionExample = {
  name: "Viga leve de bicicleta (exemplo)",
  functionText: "Viga do quadro de bicicleta, em flexão",
  objectiveText: "Mínima massa para a mesma rigidez",
  freeVariables: ["área da seção"],
  indexSlug: "viga-leve-rigidez",
  constraints: [
    { operator: "gte", property_slug: "modulo_young", value: 70, unit: "GPa" },
    { operator: "gte", property_slug: "limite_escoamento", value: 200, unit: "MPa" },
    { operator: "gt", property_slug: "temp_max_servico", value: 80, unit: "degC" },
  ],
  criteria: [{ key: "__index__", weight: "1" }],
};

/** What the live catalogue lacks for this example, by slug; empty when it can load. */
export function missingForExample(
  example: SelectionExample,
  catalogue: { indexSlugs: string[]; propertySlugs: string[] },
): string[] {
  const missing: string[] = [];
  if (!catalogue.indexSlugs.includes(example.indexSlug)) missing.push(example.indexSlug);
  for (const c of example.constraints) {
    if (c.property_slug && !catalogue.propertySlugs.includes(c.property_slug)) {
      missing.push(c.property_slug);
    }
  }
  return missing;
}
