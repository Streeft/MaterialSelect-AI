/**
 * Where a cited passage sits in the source it came from (D-220).
 *
 * The backend copies the passage into the citation as `excerpt` but not its
 * position, and a passage is the source's paragraphs joined with single spaces
 * (its line breaks are gone), so the match is by words, whitespace-blind and
 * case-sensitive. It is text location, not a calculation: nothing is
 * derived, only found. A passage that cannot be found whole is looked for by
 * its opening words (a passage may carry the overlap of its neighbour); one
 * that is not found at all returns `null` and the reader says so.
 */
export interface Span {
  start: number;
  end: number;
}

const OPENING_WORDS = 12;

function matchWords(content: string, words: string[]): Span | null {
  if (words.length === 0) return null;
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const found = new RegExp(escaped.join("\\s+")).exec(content);
  return found ? { start: found.index, end: found.index + found[0].length } : null;
}

export function locateExcerpt(content: string, excerpt: string): Span | null {
  const words = excerpt.split(/\s+/).filter(Boolean);
  return (
    matchWords(content, words) ??
    (words.length > OPENING_WORDS ? matchWords(content, words.slice(0, OPENING_WORDS)) : null)
  );
}
