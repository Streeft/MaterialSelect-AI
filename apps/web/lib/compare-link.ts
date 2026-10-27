/**
 * The comparator's link: what a shared URL carries (D-163).
 *
 * The address is the only place the comparison lives. Whatever has to reach
 * another reader (the materials, the reference, the highlight threshold, the
 * indices) is written to the query string and read back from it; nothing of it
 * is kept in the browser, because a value kept in one browser makes the same
 * link render two different tables for two people. The property choice and the
 * normalization travel too (D-174): the table is the one the sender sees.
 *
 * Nothing here evaluates or validates an expression: a typed index arriving in a
 * link is only *shaped* here (trimmed, bounded, deduplicated) and is then sent
 * to the backend's validator like one typed on the screen. Shape checks mirror
 * the contract (`expression` is 1 to 500 characters on the API).
 */
import { MAX_COMPUTED, expressionKey } from "@/lib/compare-expression";
import { MAX_COMPARE_PROPERTIES } from "@/lib/compareLimits";
import type { NormalizationMethod } from "@/lib/types";
import { parseThreshold, thresholdParam } from "@/lib/compare-threshold";

/** The query keys this screen owns; any other key in the address is left alone. */
export const LINK_KEYS = {
  materials: "materiais",
  reference: "referencia",
  threshold: "limiar",
  catalogue: "calculadas",
  expression: "indice",
  properties: "propriedades",
  normalization: "normalizacao",
} as const;

/** The normalization a comparison starts with; the link only writes another one. */
export const DEFAULT_NORMALIZATION: NormalizationMethod = "minmax";
const NORMALIZATIONS: readonly NormalizationMethod[] = ["minmax", "vector"];

/** Mirrors the `expression` bound of the selection and comparison contracts. */
export const MAX_EXPRESSION_LENGTH = 500;

const SLUG = /^[A-Za-z0-9_-]{1,160}$/;

/** A piece of a link, cut to what a sentence can quote. */
function quotable(raw: string): string {
  return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
}

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

export interface ParsedProperties {
  /** `null` when the link does not carry the parameter at all. */
  slugs: string[] | null;
  /** Pieces that do not have the shape of a property slug, as written. */
  malformed: string[];
  /** How many well-formed slugs were left out for being past the cap. */
  overCap: number;
}

/**
 * Property slugs from `propriedades=`, comma-separated, in the order given.
 * A malformed piece and a repeated one go (the malformed ones are kept to be
 * said); past the comparison's own cap the rest is left out and counted.
 * Whether a slug still exists in the catalogue is the page's to say: it is the
 * one that has the catalogue.
 */
export function parseProperties(raw: string | null | undefined): ParsedProperties {
  if (!raw || raw.trim() === "") return { slugs: null, malformed: [], overCap: 0 };
  const seen = new Set<string>();
  const malformed: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.trim();
    if (slug === "") continue;
    if (SLUG.test(slug)) seen.add(slug);
    else malformed.push(quotable(slug));
  }
  const all = [...seen];
  return {
    slugs: all.slice(0, MAX_COMPARE_PROPERTIES),
    malformed,
    overCap: Math.max(0, all.length - MAX_COMPARE_PROPERTIES),
  };
}

/** The normalization named by the link; an unknown one is returned as written, to be said. */
export function parseNormalization(raw: string | null | undefined): {
  value: NormalizationMethod | null;
  invalid: string | null;
} {
  if (raw === null || raw === undefined || raw.trim() === "") return { value: null, invalid: null };
  const name = raw.trim();
  const known = NORMALIZATIONS.find((n) => n === name);
  return known ? { value: known, invalid: null } : { value: null, invalid: quotable(name) };
}

export interface CompareLinkState {
  materials: readonly number[];
  reference: number | null;
  threshold: number | null;
  catalogue: readonly string[];
  expressions: readonly string[];
  /** The properties on the table, in order; written only with materials to compare. */
  properties: readonly string[];
  normalization: NormalizationMethod;
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
  // The property choice and the normalization are a reading of the materials
  // above: with none, there is no table to share and the link stays bare.
  if (state.materials.length > 0) {
    if (state.properties.length > 0) params.set(LINK_KEYS.properties, state.properties.join(","));
    if (state.normalization !== DEFAULT_NORMALIZATION) {
      params.set(LINK_KEYS.normalization, state.normalization);
    }
  }

  const text = params.toString();
  return text ? `?${text}` : "";
}

/** The comparison state a query string carries, each part read by its own rule. */
export function readCompareLink(search: URLSearchParams): {
  threshold: number | null;
  catalogue: string[];
  expressions: string[];
  properties: ParsedProperties;
  normalization: ReturnType<typeof parseNormalization>;
} {
  return {
    properties: parseProperties(search.get(LINK_KEYS.properties)),
    normalization: parseNormalization(search.get(LINK_KEYS.normalization)),
    threshold: parseThreshold(search.get(LINK_KEYS.threshold)),
    catalogue: parseCatalogueSlugs(search.get(LINK_KEYS.catalogue)),
    expressions: parseExpressions(search.getAll(LINK_KEYS.expression)),
  };
}
