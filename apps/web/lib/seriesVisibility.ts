/**
 * Show/hide state of a figure's series (D-211).
 *
 * A legend click toggles one series; Shift + click *isolates* it — every other
 * series is hidden — and doing it again on the series that is already alone
 * brings them all back. Pure and number-free: it only decides which keys are
 * drawn, never what a series says.
 */
export function isolateSeries(
  keys: readonly string[],
  hidden: ReadonlySet<string>,
  key: string,
): Set<string> {
  const others = keys.filter((k) => k !== key);
  const alreadyAlone = !hidden.has(key) && others.every((k) => hidden.has(k));
  return alreadyAlone ? new Set() : new Set(others);
}
