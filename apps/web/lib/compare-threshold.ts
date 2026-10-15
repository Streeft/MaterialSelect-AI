/**
 * The comparator's highlight threshold, as URL state (D-128).
 *
 * Validation lives here, once, for both the URL and the form: a value outside
 * the range, or that is not a plain number, is **discarded** — never clamped,
 * rounded or guessed at. A threshold quietly turned into another number would
 * highlight the wrong properties with full confidence. The range mirrors
 * `MAX_THRESHOLD_PCT` in apps/api/app/domain/spread.py (exclusive 0, inclusive
 * 1000). The percentages themselves are computed by the backend.
 */
export const MAX_THRESHOLD_PCT = 1000;

/** The number in `raw`, or `null` when it is not a valid threshold. */
export function parseThreshold(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim().replace(",", ".");
  // Digits with an optional decimal part: no exponent, no sign, no "Infinity".
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_THRESHOLD_PCT) return null;
  return value;
}

/** The URL query value for a threshold (dot-decimal, stable). */
export function thresholdParam(value: number): string {
  return String(value);
}
