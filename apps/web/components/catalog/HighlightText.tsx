import React from "react";

/**
 * Extracts positive, non-empty terms from a search query string.
 * Strips operators (AND, OR, NOT), quotes, wildcards (*, ?), and parentheses.
 */
export function extractHighlightTerms(query?: string): string[] {
  if (!query) return [];
  const rawTokens = query
    .replace(/[()[\]"]/g, " ")
    .replace(/\*|\?/g, "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const reserved = new Set(["and", "or", "not"]);
  const terms: string[] = [];

  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    if (!reserved.has(lower) && !terms.includes(lower) && lower.length > 0) {
      terms.push(lower);
    }
  }

  return terms;
}

interface HighlightTextProps {
  text: string;
  query?: string;
  className?: string;
}

/**
 * Highlights matches of query terms in the provided text, case-insensitively,
 * while preserving original casing of text.
 */
export function HighlightText({ text, query, className }: HighlightTextProps) {
  const terms = React.useMemo(() => extractHighlightTerms(query), [query]);

  if (!query || terms.length === 0 || !text) {
    return <span className={className}>{text}</span>;
  }

  // Escape regex special chars in terms
  const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isMatch = terms.some((term) => term.toLowerCase() === part.toLowerCase());
        if (isMatch) {
          return (
            <mark
              key={index}
              className="rounded bg-amber-100 px-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </span>
  );
}
