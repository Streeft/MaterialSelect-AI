"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAIStatus, suggestNextSteps } from "@/lib/api";
import { apiErrorKind, describeApiError } from "@/lib/errors";
import { useQuery } from "@tanstack/react-query";
import { suggestText } from "@/lib/i18n-suggest";
import type { SuggestionsOut, SuggestTool } from "@/lib/types";

export type AISuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; rateLimited: boolean }
  | { status: "ready"; data: SuggestionsOut };

export interface UseAISuggest {
  state: AISuggestState;
  /** Asks the server now. Never called by the hook itself: only a click reaches it. */
  ask: () => void;
  /**
   * True when the answer on screen was asked for another context than the
   * current one — the screen moved on (an action was applied, a filter changed).
   */
  stale: boolean;
  /** False only when the server says the AI layer is off. */
  enabled: boolean;
}

/**
 * D-229: the data side of `AISuggestPanel`, reusable by any screen that wants
 * the answer without the panel.
 *
 * It spends nothing until `ask()` runs: the free Google quota is shared, so a
 * screen opening must not call the model. One call at a time — a new `ask()`
 * cancels the one still on its way, and an unmounted screen cancels its own.
 * The status (is the layer on?) is the cheap `GET /api/ai/status`, shared with
 * every other AI screen through one query key; if it cannot be read, the layer
 * is taken as on and the real call says what is wrong.
 */
export function useAISuggest(tool: SuggestTool, context: Record<string, unknown>): UseAISuggest {
  const [state, setState] = useState<AISuggestState>({ status: "idle" });
  const [askedKey, setAskedKey] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const status = useQuery({ queryKey: ["ai-status"], queryFn: () => getAIStatus(), staleTime: 5 * 60_000 });

  const key = JSON.stringify(context);
  // The latest context, read at ask time without re-creating `ask` on every render.
  const latest = useRef({ tool, context, key });
  useEffect(() => {
    latest.current = { tool, context, key };
  });

  const ask = useCallback(() => {
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    const { tool: askedTool, context: askedContext, key: askedWith } = latest.current;
    setState({ status: "loading" });
    setAskedKey(askedWith);
    suggestNextSteps(askedTool, askedContext, mine.signal).then(
      (data) => {
        if (controller.current !== mine) return;
        controller.current = null;
        setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (mine.signal.aborted || controller.current !== mine) return;
        controller.current = null;
        setState({
          status: "error",
          message: describeApiError(error, suggestText.errorFallback),
          rateLimited: apiErrorKind(error) === "rateLimited",
        });
      },
    );
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return {
    state,
    ask,
    stale: state.status === "ready" && askedKey !== null && askedKey !== key,
    enabled: status.data ? status.data.enabled : true,
  };
}
