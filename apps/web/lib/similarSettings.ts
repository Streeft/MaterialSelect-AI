// Nearness settings in the URL (D-120).
//
// The weight and one-sided criterion of each basis property are parameters of
// the question, like the reference itself (B1): they live in the URL so the
// same link always asks the same thing. This module only reads and writes that
// text — the distance is computed by the backend, never here.

import type { NearnessCriterion } from "@/lib/types";

export const WEIGHT_PARAM = "sim_peso";
export const CRITERION_PARAM = "sim_criterio";

/** The weights the interface offers. The backend accepts any 0 < w <= 10. */
export const WEIGHT_OPTIONS = [0.5, 1, 2, 3, 5] as const;
export const MAX_WEIGHT = 10;

/** URL token for each criterion: pt-BR, since the URL is something people read. */
const CRITERION_TOKENS: Record<NearnessCriterion, string> = {
  both: "igual",
  at_most: "menor",
  at_least: "maior",
};
// A Map, not an object: `{}["toString"]` is a function inherited from the
// prototype and would pass for a criterion.
const TOKEN_TO_CRITERION = new Map<string, NearnessCriterion>(
  (Object.entries(CRITERION_TOKENS) as [NearnessCriterion, string][]).map(
    ([criterion, token]) => [token, criterion],
  ),
);

export interface NearnessSettings {
  weights: Record<string, number>;
  criteria: Record<string, NearnessCriterion>;
}

function pairs(raw: string | null): [string, string][] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.split(":"))
    .filter(
      (parts): parts is [string, string] =>
        parts.length === 2 && Boolean(parts[0]),
    )
    .map(([slug, value]) => [slug, value]);
}

/**
 * Settings read from the URL. An entry that is not a valid weight or criterion
 * is dropped, not repaired — a hand-edited link must not ask a question nobody
 * wrote. Defaults (weight 1, "igual") are simply absent.
 */
export function parseSettings(params: {
  get(name: string): string | null;
}): NearnessSettings {
  const weights: Record<string, number> = {};
  for (const [slug, value] of pairs(params.get(WEIGHT_PARAM))) {
    const weight = Number(value);
    if (
      Number.isFinite(weight) &&
      weight > 0 &&
      weight <= MAX_WEIGHT &&
      weight !== 1
    ) {
      weights[slug] = weight;
    }
  }
  const criteria: Record<string, NearnessCriterion> = {};
  for (const [slug, token] of pairs(params.get(CRITERION_PARAM))) {
    const criterion = TOKEN_TO_CRITERION.get(token);
    if (criterion && criterion !== "both") criteria[slug] = criterion;
  }
  return { weights, criteria };
}

/** Writes settings into ``params``, keeping only non-default entries in the basis. */
export function writeSettings(
  params: URLSearchParams,
  settings: NearnessSettings,
  basis: string[],
): URLSearchParams {
  const next = new URLSearchParams(params);
  const weightText = basis
    .filter(
      (slug) =>
        settings.weights[slug] !== undefined && settings.weights[slug] !== 1,
    )
    .map((slug) => `${slug}:${settings.weights[slug]}`)
    .join(",");
  const criterionText = basis
    .filter((slug) => (settings.criteria[slug] ?? "both") !== "both")
    .map(
      (slug) =>
        `${slug}:${CRITERION_TOKENS[settings.criteria[slug] ?? "both"]}`,
    )
    .join(",");
  if (weightText) next.set(WEIGHT_PARAM, weightText);
  else next.delete(WEIGHT_PARAM);
  if (criterionText) next.set(CRITERION_PARAM, criterionText);
  else next.delete(CRITERION_PARAM);
  return next;
}

/** The request fields for a basis: settings outside it never reach the server. */
export function requestSettings(
  settings: NearnessSettings,
  basis: string[],
): NearnessSettings {
  const weights: Record<string, number> = {};
  const criteria: Record<string, NearnessCriterion> = {};
  for (const slug of basis) {
    const weight = settings.weights[slug];
    if (weight !== undefined && weight !== 1) weights[slug] = weight;
    const criterion = settings.criteria[slug];
    if (criterion && criterion !== "both") criteria[slug] = criterion;
  }
  return { weights, criteria };
}

// --- Tolerance "100% se dentro de ±x%" (D-155) -----------------------------

export const TOLERANCE_PARAM = "sim_tolerancia";

/** Mirrors the backend ceiling (`MAX_TOLERANCE_PCT`); the server still decides. */
export const MAX_TOLERANCE_PCT = 100;

/**
 * A tolerance as typed: blank is `null` ("no band", never 0 — D-24); a value
 * that is not a number in (0, 100] is `"invalid"`, which the field reports in
 * words. The pt-BR comma is accepted. Input parsing, not arithmetic: the bands
 * and who falls inside them come from the backend.
 */
export function parseToleranceInput(raw: string): number | null | "invalid" {
  const text = raw.trim().replace("%", "").trim();
  if (text === "") return null;
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TOLERANCE_PCT) {
    return "invalid";
  }
  return value;
}

/** The tolerance in the URL; an invalid entry is dropped, not repaired. */
export function parseTolerance(params: {
  get(name: string): string | null;
}): number | null {
  const raw = params.get(TOLERANCE_PARAM);
  if (raw === null) return null;
  const value = parseToleranceInput(raw);
  return typeof value === "number" ? value : null;
}

/** Writes the tolerance into ``params``; `null` removes it. */
export function writeTolerance(
  params: URLSearchParams,
  tolerance: number | null,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (tolerance === null) next.delete(TOLERANCE_PARAM);
  else next.set(TOLERANCE_PARAM, String(tolerance));
  return next;
}

// --- Per-property tolerance (D-158) ----------------------------------------

export const PROPERTY_TOLERANCE_PARAM = "sim_tolerancia_prop";

/**
 * Per-property tolerances in the URL (`slug:x,slug:x`). An entry that is not a
 * valid tolerance is dropped, not repaired, as a weight is. A property absent
 * from the map uses the global tolerance, if any.
 */
export function parsePropertyTolerances(params: {
  get(name: string): string | null;
}): Record<string, number> {
  const tolerances: Record<string, number> = {};
  for (const [slug, raw] of pairs(params.get(PROPERTY_TOLERANCE_PARAM))) {
    const value = parseToleranceInput(raw);
    if (typeof value === "number") tolerances[slug] = value;
  }
  return tolerances;
}

/** Writes the per-property tolerances into ``params``; an empty map removes them. */
export function writePropertyTolerances(
  params: URLSearchParams,
  tolerances: Record<string, number>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const text = Object.entries(tolerances)
    .map(([slug, value]) => `${slug}:${value}`)
    .join(",");
  if (text) next.set(PROPERTY_TOLERANCE_PARAM, text);
  else next.delete(PROPERTY_TOLERANCE_PARAM);
  return next;
}

/**
 * The per-property tolerances a request sends: only the basis, since the
 * server refuses a tolerance for a property outside the question (422).
 */
export function requestTolerances(
  tolerances: Record<string, number>,
  basis: string[],
): Record<string, number> {
  const sent: Record<string, number> = {};
  for (const slug of basis) {
    const value = tolerances[slug];
    if (value !== undefined) sent[slug] = value;
  }
  return sent;
}
