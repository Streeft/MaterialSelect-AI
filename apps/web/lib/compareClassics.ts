/**
 * D-221: classic pairs for the comparator's empty state — the comparisons a
 * materials course makes first (steel against aluminium, HDPE against PP).
 *
 * A pair is two *names*, not two records: each side is looked up in the
 * catalogue the reader has, by the material's name, without accents or case.
 * A side the catalogue does not have drops the whole pair — the shelf offers
 * only what can actually be compared, and never stands a record in for one it
 * does not hold. Choosing a pair only fills the materials; the comparison is
 * the same request as one built by hand.
 */

export interface ClassicPair {
  /** What each side is called on the button. */
  labels: readonly [string, string];
  /** Name fragments that find each side, the first match wins, in catalogue order. */
  terms: readonly [readonly string[], readonly string[]];
}

export const CLASSIC_PAIRS: readonly ClassicPair[] = [
  { labels: ["Aço", "Alumínio"], terms: [["aco"], ["aluminio"]] },
  { labels: ["PEAD", "PP"], terms: [["pead", "polietileno de alta"], ["polipropileno", "pp "]] },
  { labels: ["Titânio", "Aço"], terms: [["titanio"], ["aco"]] },
  { labels: ["Cobre", "Alumínio"], terms: [["cobre"], ["aluminio"]] },
  { labels: ["Vidro", "Policarbonato"], terms: [["vidro"], ["policarbonato"]] },
];

export function foldName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface Named {
  id: number;
  name: string;
}

export interface ResolvedPair {
  labels: readonly [string, string];
  ids: [number, number];
  names: [string, string];
}

function find(materials: readonly Named[], terms: readonly string[], skip: number | null): Named | null {
  for (const term of terms) {
    const hit = materials.find(
      (m) => m.id !== skip && (foldName(m.name) + " ").includes(term),
    );
    if (hit) return hit;
  }
  return null;
}

/** The pairs this catalogue can answer, each with the two records it found. */
export function resolveClassicPairs(
  materials: readonly Named[],
  pairs: readonly ClassicPair[] = CLASSIC_PAIRS,
): ResolvedPair[] {
  const out: ResolvedPair[] = [];
  for (const pair of pairs) {
    const a = find(materials, pair.terms[0], null);
    if (!a) continue;
    const b = find(materials, pair.terms[1], a.id);
    if (!b) continue;
    out.push({ labels: pair.labels, ids: [a.id, b.id], names: [a.name, b.name] });
  }
  return out;
}
