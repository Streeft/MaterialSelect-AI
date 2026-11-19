/**
 * A family's processes, grouped by sub-family (D-254).
 *
 * The family card of the Processos screen listed everything under a root in one
 * column; "Conformação" alone has over a hundred. Past `GROUP_FROM` the card
 * groups them by the root's direct children, so the reader folds what they are
 * not looking at. Pure and client side, like `taxonomy.ts` — the grouping is a
 * walk over folders the server already sent, no value is computed.
 */

import { descendantSlugs, type TaxonomyNode } from "@/lib/taxonomy";

/** More processes than this in one family and the card groups them. */
export const GROUP_FROM = 12;

export interface ProcessGroup<P> {
  /** The sub-family's slug; `null` for what is filed directly at the family root. */
  slug: string | null;
  name: string | null;
  processes: P[];
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/**
 * The root's direct child that holds `slug` (the sub-family a process belongs to,
 * however deep it is filed), or `null` when it is filed at the root itself.
 * Climbs `parent_id`, and stops on a cycle — `parent_id` carries no constraint
 * against one, the same defence `descendantSlugs` has.
 */
function subfamilyOf<N extends TaxonomyNode & { name: string }>(
  slug: string,
  root: N,
  byId: Map<number, N>,
  bySlug: Map<string, N>,
): N | null {
  let node = bySlug.get(slug);
  const seen = new Set<number>();
  while (node && node.parent_id !== null && node.parent_id !== root.id) {
    if (seen.has(node.id)) return null;
    seen.add(node.id);
    node = byId.get(node.parent_id);
  }
  return node && node.id !== root.id ? node : null;
}

/**
 * Groups `processes` (each with a `class_slug`) of the family `rootSlug`. Sub-families are
 * ordered by name, the group of what is filed at the root itself comes last, and every
 * process lands in exactly one group, in the order it arrived. An empty sub-family has
 * no group: the card lists what exists, not what could.
 */
export function groupBySubfamily<
  P extends { class_slug: string },
  N extends TaxonomyNode & { name: string },
>(rootSlug: string, classes: N[], processes: P[]): ProcessGroup<P>[] {
  const root = classes.find((c) => c.slug === rootSlug);
  const inside = descendantSlugs(rootSlug, classes);
  const members = processes.filter((p) => inside.has(p.class_slug));
  if (!root) return members.length ? [{ slug: null, name: null, processes: members }] : [];

  const byId = new Map(classes.map((c) => [c.id, c]));
  const bySlug = new Map(classes.map((c) => [c.slug, c]));
  const groups = new Map<string | null, ProcessGroup<P>>();
  for (const process of members) {
    const sub = subfamilyOf(process.class_slug, root, byId, bySlug);
    const key = sub ? sub.slug : null;
    let group = groups.get(key);
    if (!group) {
      group = { slug: key, name: sub ? sub.name : null, processes: [] };
      groups.set(key, group);
    }
    group.processes.push(process);
  }
  const named = [...groups.values()]
    .filter((g) => g.slug !== null)
    .sort((a, b) => collator.compare(a.name ?? "", b.name ?? ""));
  const direct = groups.get(null);
  return direct ? [...named, direct] : named;
}
