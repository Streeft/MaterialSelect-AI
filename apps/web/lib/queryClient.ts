import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

/**
 * Lists that change only with a deploy or a curator's edit (D-223): property
 * definitions, classes, processes, the glossary and the calculators' starting
 * numbers. They stay fresh for five minutes; past that, the browser asks again
 * with `If-None-Match` and the API answers 304 when nothing changed. A
 * curator's own edit still shows at once: those screens invalidate the key.
 */
export const STATIC_LIST_KEYS = [
  "properties",
  "ordinal-properties",
  "classes",
  "processes",
  "process-classes",
  "process-attributes",
  "glossary",
  "padroes",
] as const;

export const STATIC_LIST_STALE_MS = 5 * 60_000;

/**
 * One more try for a server error or a dropped connection; none for a 4xx
 * (D-223). A refused, missing or invalid request answers the same the second
 * time, and a 429 asks precisely not to be repeated right away.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
    },
  });
  for (const key of STATIC_LIST_KEYS) {
    client.setQueryDefaults([key], { staleTime: STATIC_LIST_STALE_MS });
  }
  return client;
}
