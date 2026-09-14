import { describe, expect, it } from "vitest";
import { descendantSlugs, roots, type TaxonomyNode } from "./taxonomy";

/**
 *   metais ── ferrosos ── acos
 *          └─ leves
 *   polimeros
 */
const tree: TaxonomyNode[] = [
  { id: 1, slug: "metais", parent_id: null },
  { id: 2, slug: "ferrosos", parent_id: 1 },
  { id: 3, slug: "acos", parent_id: 2 },
  { id: 4, slug: "leves", parent_id: 1 },
  { id: 5, slug: "polimeros", parent_id: null },
];

describe("descendantSlugs", () => {
  it("reaches past the first level", () => {
    // The case a hard-coded two levels would get wrong: `acos` is a grandchild.
    expect(descendantSlugs("metais", tree)).toEqual(
      new Set(["metais", "ferrosos", "acos", "leves"]),
    );
  });

  it("includes the root itself", () => {
    // "How much is in here" counts what is filed at this level too.
    expect(descendantSlugs("polimeros", tree)).toEqual(new Set(["polimeros"]));
  });

  it("stops at a leaf", () => {
    expect(descendantSlugs("acos", tree)).toEqual(new Set(["acos"]));
  });

  it("yields the root alone when the tree has not loaded yet", () => {
    // Never an empty set: a page mid-load still has a family to render.
    expect(descendantSlugs("metais", [])).toEqual(new Set(["metais"]));
  });

  it("terminates on a cycle instead of spinning", () => {
    // `parent_id` has no constraint against this, so corrupt data can describe
    // it — and a browse page must not hang on a row nobody noticed.
    const cyclic: TaxonomyNode[] = [
      { id: 1, slug: "a", parent_id: 2 },
      { id: 2, slug: "b", parent_id: 1 },
    ];
    expect(descendantSlugs("a", cyclic)).toEqual(new Set(["a", "b"]));
  });
});

describe("roots", () => {
  it("keeps only the folders with no parent", () => {
    expect(roots(tree).map((n) => n.slug)).toEqual(["metais", "polimeros"]);
  });
});
