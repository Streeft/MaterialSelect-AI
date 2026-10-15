"use client";

import { useCallback } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useSnackbar } from "@/components/ui/Snackbar";
import { ptBR } from "@/lib/i18n";

const t = ptBR.snackbar;

/** A list (or a list inside a record) with the row `id` taken out. */
export function withoutId(id: number) {
  return (old: unknown): unknown =>
    Array.isArray(old) ? old.filter((row) => (row as { id?: number })?.id !== id) : old;
}

/** A record that holds its rows in `field` (a notebook and its sources), minus row `id`. */
export function withoutChild(field: string, id: number) {
  return (old: unknown): unknown => {
    if (!old || typeof old !== "object") return old;
    const record = old as Record<string, unknown>;
    const rows = record[field];
    if (!Array.isArray(rows)) return old;
    return { ...record, [field]: rows.filter((row) => (row as { id?: number })?.id !== id) };
  };
}

export interface UndoableDelete {
  /** What was deleted, as the snackbar names it: "Estudo", "Fonte"… */
  what: string;
  /**
   * The cached lists the item must disappear from now, each with the function
   * that takes it out. Anything not listed is refetched when the deletion
   * resolves either way.
   */
  hide: { queryKey: QueryKey; remove: (old: unknown) => unknown }[];
  /** The real deletion. It runs only if the reader does not undo. */
  commit: () => Promise<unknown>;
}

/**
 * Delete with "Desfazer" and no backend support for it (D-130).
 *
 * The item leaves the screen at once, a snackbar offers to bring it back, and
 * the API is called only when the snackbar goes away without the action — the
 * pattern Gmail uses for "Conversa arquivada". Until then the server still has
 * the item, so a closed tab or a dead battery loses the *deletion*, never data.
 *
 * Undo is therefore not a restore of anything: it cancels a call that has not
 * happened and refetches the lists. If the deletion fails, the lists are
 * refetched too and the reader is told, so the screen never claims a deletion
 * the server refused.
 */
export function useUndoableDelete() {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();

  return useCallback(
    ({ what, hide, commit }: UndoableDelete) => {
      const refresh = () => {
        for (const { queryKey } of hide) void queryClient.invalidateQueries({ queryKey });
      };

      for (const { queryKey, remove } of hide) {
        // A refetch in flight would put the row back before the deletion commits.
        void queryClient.cancelQueries({ queryKey });
        queryClient.setQueriesData({ queryKey }, remove);
      }

      notify({
        message: t.removed(what),
        action: { label: t.undo, onAction: refresh },
        onExpire: () => {
          commit()
            .then(refresh)
            .catch(() => {
              refresh();
              notify({ message: t.deleteFailed });
            });
        },
      });
    },
    [queryClient, notify],
  );
}
