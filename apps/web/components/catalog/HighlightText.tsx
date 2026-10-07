import React from "react";

/** D-105 fields that ask a structured question and match no visible text. */
const STRUCTURED_FIELD = /^(comp|composi[cç][aã]o|norma):/i;
/** `designacao:CODE` highlights the code itself. */
const DESIGNATION_FIELD = /^designa[cç][aã]o:/i;

/**
 * Extracts positive, non-empty terms from a search query string.
 * Strips operators (AND, OR, NOT), quotes, wildcards (*, ?), and parentheses.
 * D-105: `comp:` and `norma:` are dropped (they match no visible text), and
 * `designacao:CODE` contributes the code. Display only — which materials match
 * is decided by the backend parser.
 */
export function extractHighlightTerms(query?: string): string[] {
  if (!query) return [];
  const rawTokens = query
    .replace(/[()[\]]/g, " ")
    // `designacao:"304 L"` → `designacao:304L`, so the prefix stays with its code.
    .replace(/(designa[cç][aã]o:)"([^"]*)"/gi, (_m, field: string, code: string) =>
      `${field}${code.replace(/\s+/g, "")}`,
    )
    .split(/\s+/)
    .filter((token) => !STRUCTURED_FIELD.test(token) && !/^[<>=≥≤]/.test(token))
    .map((token) => token.replace(DESIGNATION_FIELD, ""))
    .join(" ")
    .replace(/"/g, " ")
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
