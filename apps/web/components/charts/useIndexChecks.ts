"use client";

import { useQueries } from "@tanstack/react-query";
import { ApiError, evaluateIndex } from "@/lib/api";
import { expressionKey } from "@/lib/compare-expression";
import { compareLinkText } from "@/lib/i18n-compare-link";

export type IndexCheckState = "checking" | "accepted" | "refused";

export interface IndexCheck {
  expression: string;
  state: IndexCheckState;
  /** The backend's own written reason, when it refused. */
  message?: string;
}

/** Cache key of one expression's verdict; the form seeds it once the server accepts. */
export function indexCheckKey(expression: string) {
  return ["index-check", expressionKey(expression)] as const;
}

/**
 * The verdict of the backend's index validator on each typed expression (D-153).
 *
 * An expression typed on the screen has already been accepted by the time it
 * gets here (the page seeds the verdict), so it costs no second call. One that
 * arrived in a link has not: it is sent to the same validator, and until the
 * answer is in it is "checking" and stays out of the comparison request. A
 * refused one keeps the server's message and is never repaired or guessed at.
 */
export function useIndexChecks(expressions: readonly string[]): IndexCheck[] {
  const results = useQueries({
    queries: expressions.map((expression) => ({
      queryKey: indexCheckKey(expression),
      queryFn: async () => {
        await evaluateIndex(expression, "maximize");
        return true as const;
      },
      retry: false,
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });
  return expressions.map((expression, i): IndexCheck => {
    const result = results[i];
    if (!result || result.isPending) return { expression, state: "checking" };
    if (result.isError) {
      const error = result.error;
      return {
        expression,
        state: "refused",
        message: error instanceof ApiError ? error.message : compareLinkText.unverified,
      };
    }
    return { expression, state: "accepted" };
  });
}
