/**
 * Pure walks over a taxonomy, client side (P1-4).
 *
 * The twin of `app/domain/taxonomy.py`, and deliberately the same shape of
 * answer: a folder's subtree. The backend needs it to decide what a Tree stage
 * admits; the browse screens need it to decide what a family's page shows.
 *
 * Written once and shared by both universes because a folder is a folder: the
 * material taxonomy and the process taxonomy are the same self-referential
 * structure (D-57), and two copies of this walk would be two chances to
 * disagree about who is under whom.
 */

/** The shape both taxonomies satisfy — everything this module needs. */
export interface TaxonomyNode {
  id: number;
  slug: string;
  parent_id: number | null;
}

/**
 * Every slug at or under `rootSlug`, the root itself included.
 *
 * Breadth-first over `parent_id` rather than assuming a depth: the taxonomy is
 * seeded data and an operator can deepen it without a migration, so a hard-coded
 * two levels would silently drop whatever they add.
 *
 * Two defences, both against the data rather than the caller — the same two
 * `lineages` takes in the backend:
 *
 * * a root that is not in `nodes` yields just itself, never an empty set, so a
 *   page still renders while the class list is still loading;
 * * `parent_id` carries no constraint against cycles, so corrupt data can
 *   describe one. Nothing is visited twice, so the walk terminates.
 */
export function descendantSlugs(rootSlug: string, nodes: TaxonomyNode[]): Set<string> {
  const slugs = new Set([rootSlug]);
  const root = nodes.find((n) => n.slug === rootSlug);
  if (root === undefined) return slugs;

  const ids = new Set([root.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (node.parent_id !== null && ids.has(node.parent_id) && !ids.has(node.id)) {
        ids.add(node.id);
        slugs.add(node.slug);
        grew = true;
      }
    }
  }
  return slugs;
}

/** The taxonomy's roots, which is where a reader starts. */
export function roots<T extends TaxonomyNode>(nodes: T[]): T[] {
  return nodes.filter((n) => n.parent_id === null);
}
