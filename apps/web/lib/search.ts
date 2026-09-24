/**
 * Text matching for type-to-search pickers.
 *
 * Accent- and case-insensitive: a student typing "modulo" on a laptop without a
 * Portuguese layout must still find "Módulo de Young". Not a numeric
 * computation — only how two strings are compared.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Every word of the query appears somewhere in the haystack. */
export function matchesQuery(query: string, ...haystack: (string | null | undefined)[]): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = normalizeForSearch(haystack.filter(Boolean).join(" "));
  return words.every((word) => text.includes(word));
}
