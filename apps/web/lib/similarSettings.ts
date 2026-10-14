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
const TOKEN_TO_CRITERION = Object.fromEntries(
  Object.entries(CRITERION_TOKENS).map(([criterion, token]) => [
    token,
    criterion,
  ]),
) as Record<string, NearnessCriterion>;

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
    const criterion = TOKEN_TO_CRITERION[token];
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
