/**
 * Helpers for the comparator's free-typed index (D-153).
 *
 * Nothing here evaluates anything: the expression is validated and computed by
 * the backend (principle 2). The calculator (D-191) reads the variables, the
 * examples and the friendly names from the backend, not from here.
 */

/** The most computed columns one comparison takes; mirrors MAX_COMPARE_COMPUTED. */
export const MAX_COMPUTED = 10;

/** Whitespace-insensitive key, so `a/b` and `a / b` count as the same column. */
export function expressionKey(expression: string): string {
  return expression.replace(/\s+/g, "");
}
