/**
 * Helpers for the comparator's free-typed index (D-153).
 *
 * Nothing here evaluates anything: the expression is validated and computed by
 * the backend (principle 2). These only name what the reader may type.
 */

/** The most computed columns one comparison takes; mirrors MAX_COMPARE_COMPUTED. */
export const MAX_COMPUTED = 10;

/**
 * The variable name an expression uses for a property slug.
 *
 * Mirrors `safe_variable` in `apps/api/app/calculations/expressions.py`: a
 * character that is not a letter, digit or underscore becomes `_`, and a name
 * starting with a digit gets a leading `_`. Showing the slug itself would offer
 * a name the evaluator does not know whenever a slug has a hyphen.
 */
export function expressionVariable(slug: string): string {
  const name = slug.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

/** Short examples, offered only when every variable in them is in the catalogue. */
const EXAMPLES: ReadonlyArray<{ expression: string; variables: readonly string[] }> = [
  { expression: "modulo_young / densidade", variables: ["modulo_young", "densidade"] },
  { expression: "limite_escoamento / densidade", variables: ["limite_escoamento", "densidade"] },
  {
    expression: "sqrt(modulo_young) / densidade",
    variables: ["modulo_young", "densidade"],
  },
];

export function usableExamples(available: ReadonlySet<string>): string[] {
  return EXAMPLES.filter((example) => example.variables.every((v) => available.has(v))).map(
    (example) => example.expression,
  );
}

/** Whitespace-insensitive key, so `a/b` and `a / b` count as the same column. */
export function expressionKey(expression: string): string {
  return expression.replace(/\s+/g, "");
}
