"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounced } from "@/lib/useDebounced";

/** Long enough for a number typed digit by digit to be asked about once. */
export const LIVE_DELAY_MS = 450;

/**
 * D-216: the result follows the inputs, as in Omni Calculator — but the number
 * is still the server's. The brief is asked about a moment after the reader
 * stops typing; the previous answer stays on screen while the next one comes,
 * marked as updating, and an invalid brief (`request === null`) asks nothing.
 *
 * Nothing is computed here: the hook only decides *when* to ask. The request is
 * serialized before it is debounced, because an object built during render is
 * a new object every render and would never settle (see `useDebounced`).
 */
export function useLiveResult<Req, Res>({
  key,
  request,
  fetcher,
  delayMs = LIVE_DELAY_MS,
}: {
  /** The query family, e.g. "custo-ao-vivo". */
  key: string;
  /** The brief, or `null` while it is not complete. */
  request: Req | null;
  fetcher: (request: Req) => Promise<Res>;
  delayMs?: number;
}) {
  const serialized = request === null ? null : JSON.stringify(request);
  const settled = useDebounced(serialized, delayMs);
  const query = useQuery({
    queryKey: [key, settled],
    // The answer travels with the brief that produced it: while the next one is
    // asked, the screen shows the previous answer *and* knows which brief it was.
    queryFn: async () => {
      const asked = JSON.parse(settled as string) as Req;
      return { request: asked, response: await fetcher(asked) };
    },
    enabled: settled !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const complete = serialized !== null;
  return {
    /** The answer for the brief on screen, or the last one while the next comes. */
    data: complete ? query.data?.response : undefined,
    /** The brief `data` answers (D-172: an export sends this one, never the inputs). */
    dataRequest: complete ? (query.data?.request ?? null) : null,
    /** Asking (or about to ask) about what is typed now. */
    updating: complete && (serialized !== settled || query.isFetching),
    error: complete && serialized === settled ? query.error : null,
    retry: () => void query.refetch(),
  };
}
