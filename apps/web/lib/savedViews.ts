"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSavedView, deleteSavedView, listSavedViews, updateSavedView } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import type {
  SavedView,
  SavedViewConfig,
  SavedViewIn,
  SavedViewPatch,
  SavedViewScope,
} from "@/lib/types";

/** D-209: the query key of one screen's views; invalidating it refreshes the tabs. */
export const savedViewsKey = (scope: SavedViewScope) => ["saved-views", scope] as const;

/**
 * One screen's saved views, kept in the reader's account (D-209). The tabs and
 * the dashboard layout read the same rows; the layout is filtered out of the
 * tabs because it is not a way of looking at a list.
 */
export function useSavedViews(scope: SavedViewScope) {
  const queryClient = useQueryClient();
  const key = savedViewsKey(scope);
  const query = useQuery({ queryKey: key, queryFn: () => listSavedViews(scope) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: (payload: Omit<SavedViewIn, "scope">) => createSavedView({ ...payload, scope }),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: SavedViewPatch }) => updateSavedView(id, patch),
    onSuccess: refresh,
  });

  const all = query.data ?? [];
  return {
    query,
    views: all.filter((view) => view.kind !== "layout"),
    layout: all.find((view) => view.kind === "layout") ?? null,
    create,
    update,
    remove: (id: number) => deleteSavedView(id),
    queryKey: key,
  };
}

/**
 * Whether the screen's current filters differ from what a view saved. Keys
 * with no value count as absent on both sides, so "Classe: Qualquer" and a
 * view without the class filter agree.
 */
export function filtersDiffer(
  current: Record<string, string | null>,
  saved: SavedViewConfig["filters"],
): boolean {
  const clean = (filters: Record<string, string | null | undefined> = {}) =>
    Object.entries(filters)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(clean(current)) !== JSON.stringify(clean(saved ?? {}));
}

export type { SavedView };

/**
 * D-209: the state of a database screen — its filters, its kind and the
 * active saved view — and everything `SavedViewsBar` needs to drive it.
 *
 * The screen owns what the filters *mean* (which query they feed); this hook
 * only keeps them, applies a view when a tab is chosen, and tells whether the
 * active view's filters drifted ("Salvar na visão").
 */
export function useDatabaseView<K extends string>({
  scope,
  initialFilters,
  defaultKind,
  onCreated,
}: {
  scope: SavedViewScope;
  initialFilters: Record<K, string | null>;
  defaultKind: "table" | "gallery" | "list";
  onCreated?: (view: SavedView) => void;
}) {
  const saved = useSavedViews(scope);
  const queryClient = useQueryClient();
  const snackbar = useOptionalSnackbar();
  const [filters, setFilters] = useState<Record<K, string | null>>(initialFilters);
  const [kind, setKind] = useState<"table" | "gallery" | "list">(defaultKind);
  const [activeId, setActiveId] = useState<number | null>(null);
  const active = saved.views.find((view) => view.id === activeId) ?? null;

  const blank = Object.fromEntries(
    Object.keys(initialFilters).map((key) => [key, null]),
  ) as Record<K, string | null>;

  function select(view: SavedView | null) {
    setActiveId(view?.id ?? null);
    if (!view) {
      setFilters(blank);
      setKind(defaultKind);
      return;
    }
    const next = { ...blank };
    for (const key of Object.keys(blank) as K[]) {
      next[key] = view.config.filters?.[key] ?? null;
    }
    setFilters(next);
    setKind(view.kind === "layout" ? defaultKind : view.kind);
  }

  function create(newKind: "table" | "gallery" | "list", name: string) {
    saved.create.mutate(
      { name, kind: newKind, config: { filters: activeFilters(filters) } },
      {
        onSuccess: (view) => {
          setActiveId(view.id);
          setKind(newKind);
          onCreated?.(view);
        },
      },
    );
  }

  return {
    saved,
    filters,
    setFilter: (key: K, value: string | null) => setFilters((f) => ({ ...f, [key]: value })),
    clearFilters: () => setFilters(blank),
    kind,
    active,
    activeId,
    select,
    create,
    dirty: active !== null && filtersDiffer(filters, active.config.filters),
    saveChanges: () => {
      if (!active) return;
      saved.update.mutate({
        id: active.id,
        patch: { config: { ...active.config, filters: activeFilters(filters) } },
      });
    },
    rename: (view: SavedView, name: string) =>
      saved.update.mutate({ id: view.id, patch: { name } }),
    // D-130: the tab goes at once and the deletion waits for the snackbar,
    // whose "Desfazer" brings it back. Outside the app shell (no snackbar) it
    // is deleted straight away.
    remove: (view: SavedView) => {
      if (activeId === view.id) select(null);
      const refresh = () => void queryClient.invalidateQueries({ queryKey: saved.queryKey });
      void queryClient.cancelQueries({ queryKey: saved.queryKey });
      queryClient.setQueryData<SavedView[]>(saved.queryKey, (old) =>
        old?.filter((v) => v.id !== view.id),
      );
      const commit = () =>
        saved
          .remove(view.id)
          .then(refresh)
          .catch(() => {
            refresh();
            snackbar?.notify({ message: ptBR.snackbar.deleteFailed });
          });
      if (!snackbar) {
        void commit();
        return;
      }
      snackbar.notify({
        message: ptBR.snackbar.removed(ptBR.ds.viewWhat(view.name)),
        action: { label: ptBR.snackbar.undo, onAction: refresh },
        onExpire: () => void commit(),
      });
    },
  };
}

function activeFilters(filters: Record<string, string | null>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
}
