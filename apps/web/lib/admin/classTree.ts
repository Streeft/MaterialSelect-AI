import type { MaterialClass } from "@/lib/types";
import { matchesQuery } from "@/lib/search";

/** One row of the Admin's class tree (D-238). */
export interface ClassRow {
  cls: MaterialClass;
  depth: number;
  /** It has subclasses in the list, so it can fold. */
  hasChildren: boolean;
  /** Shown only because a descendant matched the search (its own name did not). */
  ancestorOnly: boolean;
}

function childrenByParent(classes: readonly MaterialClass[]): Map<number | null, MaterialClass[]> {
  const ids = new Set(classes.map((c) => c.id));
  const byParent = new Map<number | null, MaterialClass[]>();
  for (const c of classes) {
    // A parent that is not in the list must not hide its child.
    const key = c.parent_id !== null && ids.has(c.parent_id) ? c.parent_id : null;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  return byParent;
}

/**
 * The classes in tree order (parents before children), each with its depth —
 * the order the server sent within a level is kept, nothing is ranked here.
 *
 * `collapsed` hides the subtree of those ids. With a `query`, the rows are the
 * classes whose name matches plus their ancestors (marked `ancestorOnly`), so a
 * match is always seen in its place; folding is ignored while searching, or a
 * match inside a folded branch would be hidden by the search that found it.
 * Matching is by name, without accents or case (`matchesQuery`): it narrows a
 * list of labels, it does not filter data.
 */
export function classTreeRows(
  classes: readonly MaterialClass[],
  { collapsed = new Set<number>(), query = "" }: { collapsed?: ReadonlySet<number>; query?: string } = {},
): ClassRow[] {
  const byParent = childrenByParent(classes);
  const q = query.trim();
  const matches = new Set<number>();
  const keep = new Set<number>();
  if (q) {
    const byId = new Map(classes.map((c) => [c.id, c]));
    for (const c of classes) {
      if (!matchesQuery(q, c.name)) continue;
      matches.add(c.id);
      // Walk up, guarding against a cycle the server would never send.
      let cursor: MaterialClass | undefined = c;
      const seen = new Set<number>();
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        keep.add(cursor.id);
        cursor = cursor.parent_id !== null ? byId.get(cursor.parent_id) : undefined;
      }
    }
  }
  const out: ClassRow[] = [];
  const seen = new Set<number>();
  const walk = (parent: number | null, depth: number) => {
    for (const cls of byParent.get(parent) ?? []) {
      if (seen.has(cls.id)) continue;
      seen.add(cls.id);
      if (q && !keep.has(cls.id)) continue;
      const hasChildren = (byParent.get(cls.id) ?? []).length > 0;
      out.push({ cls, depth, hasChildren, ancestorOnly: Boolean(q) && !matches.has(cls.id) });
      if (q || !collapsed.has(cls.id)) walk(cls.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** The ids of every class that has subclasses — what "Recolher tudo" folds. */
export function parentIds(classes: readonly MaterialClass[]): Set<number> {
  const ids = new Set(classes.map((c) => c.id));
  return new Set(
    classes.filter((c) => c.parent_id !== null && ids.has(c.parent_id)).map((c) => c.parent_id as number),
  );
}
