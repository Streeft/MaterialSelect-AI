/**
 * The comparator's link: what a shared URL carries (D-160).
 *
 * The address is the only place the comparison lives. Whatever has to reach
 * another reader (the materials, the reference, the highlight threshold, the
 * indices) is written to the query string and read back from it; nothing of it
 * is kept in the browser, because a value kept in one browser makes the same
 * link render two different tables for two people.
 *
 * Nothing here evaluates or validates an expression: a typed index arriving in a
 * link is only *shaped* here (trimmed, bounded, deduplicated) and is then sent
 * to the backend's validator like one typed on the screen. Shape checks mirror
 * the contract (`expression` is 1 to 500 characters on the API).
 */
import { MAX_COMPUTED, expressionKey } from "@/lib/compare-expression";
import { parseThreshold, thresholdParam } from "@/lib/compare-threshold";

/** The query keys this screen owns; any other key in the address is left alone. */
export const LINK_KEYS = {
  materials: "materiais",
  reference: "referencia",
  threshold: "limiar",
  catalogue: "calculadas",
  expression: "indice",
} as const;

/** Mirrors the `expression` bound of the selection and comparison contracts. */
export const MAX_EXPRESSION_LENGTH = 500;

const SLUG = /^[A-Za-z0-9_-]{1,160}$/;

/** Slugs of catalogue indices, comma-separated; malformed or repeated ones go. */
export function parseCatalogueSlugs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const slug = part.trim();
    if (SLUG.test(slug)) seen.add(slug);
  }
  return [...seen].slice(0, MAX_COMPUTED);
}

/**
 * Typed expressions from repeated `indice=` values, in the order given.
 * Empty, over-long and repeated (ignoring spaces) ones are dropped; the cap is
 * the comparison's own. A repeated parameter is used, not a comma list, because
 * an expression may itself contain commas.
 */
export function parseExpressions(values: readonly string[]): string[] {
  const kept = new Map<string, string>();
  for (const value of values) {
    const expression = value.trim();
    if (expression.length === 0 || expression.length > MAX_EXPRESSION_LENGTH) continue;
    const key = expressionKey(expression);
    if (!kept.has(key)) kept.set(key, expression);
  }
  return [...kept.values()].slice(0, MAX_COMPUTED);
}

export interface CompareLinkState {
  materials: readonly number[];
  reference: number | null;
  threshold: number | null;
  catalogue: readonly string[];
  expressions: readonly string[];
}

/**
 * The query string for `state`, keeping every key this screen does not own
 * (`current` is the address as it is). Empty parts are removed, so the link of
 * an empty comparison is the bare path.
 */
export function compareSearch(current: string, state: CompareLinkState): string {
  const params = new URLSearchParams(current);
  for (const key of Object.values(LINK_KEYS)) params.delete(key);

  if (state.materials.length > 0) params.set(LINK_KEYS.materials, state.materials.join(","));
  if (state.reference !== null && state.materials.includes(state.reference)) {
    params.set(LINK_KEYS.reference, String(state.reference));
  }
  if (state.threshold !== null) params.set(LINK_KEYS.threshold, thresholdParam(state.threshold));
  if (state.catalogue.length > 0) params.set(LINK_KEYS.catalogue, state.catalogue.join(","));
  for (const expression of state.expressions) params.append(LINK_KEYS.expression, expression);

  const text = params.toString();
  return text ? `?${text}` : "";
}

/** The comparison state a query string carries, each part read by its own rule. */
export function readCompareLink(search: URLSearchParams): {
  threshold: number | null;
  catalogue: string[];
  expressions: string[];
} {
  return {
    threshold: parseThreshold(search.get(LINK_KEYS.threshold)),
    catalogue: parseCatalogueSlugs(search.get(LINK_KEYS.catalogue)),
    expressions: parseExpressions(search.getAll(LINK_KEYS.expression)),
  };
}
