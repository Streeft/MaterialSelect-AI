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
 *
 * D-229: a term matches whole words only ("aço" is not inside "traço"), only
 * among the side's class (steel is a metal, not a mortar), and a name that
 * *is* the term or *starts* with it beats one that merely mentions it ("Aço
 * Inoxidável … Estabilizado ao Titânio" is not titanium).
 */

export interface ClassicSide {
  /** The class slug the side must belong to (e.g. "metais"). */
  classSlug: string;
  /** Name terms, most specific first; the first term with any hit decides. */
  terms: readonly string[];
}

export interface ClassicPair {
  /** What each side is called on the button. */
  labels: readonly [string, string];
  sides: readonly [ClassicSide, ClassicSide];
}

const STEEL: ClassicSide = { classSlug: "metais", terms: ["aco carbono", "aco"] };
const ALUMINIUM: ClassicSide = { classSlug: "metais", terms: ["aluminio"] };

export const CLASSIC_PAIRS: readonly ClassicPair[] = [
  { labels: ["Aço", "Alumínio"], sides: [STEEL, ALUMINIUM] },
  {
    labels: ["PEAD", "PP"],
    sides: [
      { classSlug: "polimeros", terms: ["pead", "polietileno de alta densidade"] },
      { classSlug: "polimeros", terms: ["pp", "polipropileno"] },
    ],
  },
  { labels: ["Titânio", "Aço"], sides: [{ classSlug: "metais", terms: ["titanio"] }, STEEL] },
  { labels: ["Cobre", "Alumínio"], sides: [{ classSlug: "metais", terms: ["cobre"] }, ALUMINIUM] },
  {
    labels: ["Vidro", "Policarbonato"],
    sides: [
      { classSlug: "ceramicas", terms: ["vidro soda-cal", "vidro"] },
      { classSlug: "polimeros", terms: ["policarbonato"] },
    ],
  },
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
  class_slug: string;
}

export interface ResolvedPair {
  labels: readonly [string, string];
  ids: [number, number];
  names: [string, string];
}

const WORD_CHAR = /[a-z0-9]/;

/**
 * How well a folded name answers a folded term: 0 the name is the term, 1 it
 * starts with the term, 2 it holds the term as whole words elsewhere, null no.
 */
export function matchRank(name: string, term: string): 0 | 1 | 2 | null {
  if (name === term) return 0;
  let from = 0;
  let best: 1 | 2 | null = null;
  for (;;) {
    const at = name.indexOf(term, from);
    if (at < 0) return best;
    const before = at === 0 ? "" : name.charAt(at - 1);
    const after = name.charAt(at + term.length);
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) {
      if (at === 0) return 1;
      best = 2;
    }
    from = at + 1;
  }
}

function find(materials: readonly Named[], side: ClassicSide, skip: number | null): Named | null {
  for (const term of side.terms) {
    let best: { rank: number; hit: Named } | null = null;
    for (const m of materials) {
      if (m.id === skip || m.class_slug !== side.classSlug) continue;
      const rank = matchRank(foldName(m.name), term);
      // Strictly better only: among equals the catalogue order decides.
      if (rank !== null && (best === null || rank < best.rank)) best = { rank, hit: m };
    }
    if (best) return best.hit;
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
    const a = find(materials, pair.sides[0], null);
    if (!a) continue;
    const b = find(materials, pair.sides[1], a.id);
    if (!b) continue;
    out.push({ labels: pair.labels, ids: [a.id, b.id], names: [a.name, b.name] });
  }
  return out;
}
