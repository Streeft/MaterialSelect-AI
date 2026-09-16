"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Universe } from "@/lib/types";
import { touchRecent } from "@/lib/api";
import { MY_RECORDS_KEY } from "./FavoriteButton";

/**
 * Tell the API that this reader has opened a record (P1-4).
 *
 * The write is declared here, by the page, rather than folded into the
 * datasheet's own GET on the server: a read that writes is un-cacheable and
 * non-idempotent, and an export or a report re-reading the same record would
 * silently reorder the list.
 *
 * A ref guards against the double-invocation React does in development's
 * strict mode — recording the same visit twice is harmless at the database
 * (the row is upserted) but would send a pointless second request on every
 * datasheet in development.
 *
 * Failure is swallowed on purpose. "You looked at this" is the least important
 * thing on the page, and an error toast about a bookmark would be noise over
 * the datasheet the reader actually came for.
 */
export function useRecordVisit(universe: Universe, recordId: number | undefined): void {
  const client = useQueryClient();
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    if (recordId === undefined || !Number.isFinite(recordId)) return;
    const key = `${universe}:${recordId}`;
    if (recorded.current === key) return;
    recorded.current = key;

    void touchRecent(universe, recordId)
      .then(() => client.invalidateQueries({ queryKey: MY_RECORDS_KEY }))
      .catch(() => undefined);
  }, [universe, recordId, client]);
}
