"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notebook, NotebookSource } from "@/lib/types";
import {
  deleteNotebookSource,
  getNotebookSource,
  selectAllNotebookSources,
  updateNotebookSource,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  IconButton,
  Input,
  LoadingState,
  PanelHeader,
} from "@/components/ui";
import { IconPlus, IconSearch, IconTrash } from "@/components/ui/icons";
import { AddSourcesDialog } from "./AddSourcesDialog";
import { notebookKey } from "./keys";
import { SourceIcon } from "./sourceIcon";

const t = ptBR.notebooks;

/**
 * The left panel: what this notebook knows. Each source has its checkbox — only
 * the marked ones are searched when the student asks — and its title opens the
 * text itself, so an answer can always be checked against the whole source,
 * not only the passage it cited.
 */
export function SourcesPanel({
  notebook,
  expanded,
  onToggle,
}: {
  notebook: Notebook;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [reading, setReading] = useState<NotebookSource | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: notebookKey(notebook.id) });

  const toggle = useMutation({
    mutationFn: ({ id, selected }: { id: number; selected: boolean }) =>
      updateNotebookSource(notebook.id, id, { selected }),
    onSuccess: refresh,
  });
  const toggleAll = useMutation({
    mutationFn: (selected: boolean) => selectAllNotebookSources(notebook.id, selected),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteNotebookSource(notebook.id, id),
    onSuccess: refresh,
  });

  const sources = notebook.sources;
  const allSelected = sources.length > 0 && sources.every((s) => s.selected);
  const full = sources.length >= notebook.max_sources;
  const error = toggle.error ?? toggleAll.error ?? remove.error;

  return (
    <section aria-labelledby="fontes-titulo" className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title={t.panels.sources}
        headingId="fontes-titulo"
        expanded={expanded}
        onToggle={onToggle}
        // Below `lg` one panel shows at a time; there is nothing to fold.
        toggleClassName="hidden lg:inline-flex"
        toggleLabel={expanded ? t.collapse(t.panels.sources) : t.expand(t.panels.sources)}
        controls="fontes-corpo"
      />
      {expanded ? (
        <div id="fontes-corpo" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <Button
            variant="secondary"
            icon={<IconPlus />}
            onClick={() => setAdding(true)}
            disabled={full}
            className="w-full justify-center"
          >
            {t.addSources}
          </Button>

          <div className="flex flex-col gap-1 rounded-card border border-edge bg-surface-sunken p-2.5">
            <div className="flex items-center gap-2 text-ink-subtle">
              <IconSearch />
              <Input
                aria-label={t.webSearch}
                label=""
                placeholder={t.webSearch}
                disabled
                className="flex-1"
              />
            </div>
            <p className="text-2xs text-ink-muted">{t.webSearchSoon}</p>
          </div>

          {error ? (
            <Alert tone="danger" role="alert">
              {error.message}
            </Alert>
          ) : null}

          {sources.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.noSources}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-2xs text-ink-muted">
                  {t.sourceLimit(sources.length, notebook.max_sources)}
                </span>
                <Checkbox
                  label={t.selectAll}
                  checked={allSelected}
                  onChange={(event) => toggleAll.mutate(event.target.checked)}
                />
              </div>
              <ul className="flex flex-col gap-1">
                {sources.map((source) => (
                  <li
                    key={source.id}
                    className="group flex items-center gap-2 rounded-control px-1.5 py-1.5 hover:bg-surface-sunken"
                  >
                    <SourceIcon kind={source.kind} className="text-brand-700" />
                    <button
                      type="button"
                      onClick={() => setReading(source)}
                      aria-label={t.openSource(source.title)}
                      className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-brand-700"
                    >
                      {source.title}
                    </button>
                    <IconButton
                      size="sm"
                      label={t.removeSource(source.title)}
                      icon={<IconTrash />}
                      onClick={() => remove.mutate(source.id)}
                    />
                    <Checkbox
                      label={<span className="sr-only">{t.useSource(source.title)}</span>}
                      checked={source.selected}
                      onChange={(event) =>
                        toggle.mutate({ id: source.id, selected: event.target.checked })
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      <AddSourcesDialog notebookId={notebook.id} open={adding} onClose={() => setAdding(false)} />
      <SourceReader notebookId={notebook.id} source={reading} onClose={() => setReading(null)} />
    </section>
  );
}

function SourceReader({
  notebookId,
  source,
  onClose,
}: {
  notebookId: number;
  source: NotebookSource | null;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: [...notebookKey(notebookId), "source", source?.id],
    queryFn: () => getNotebookSource(notebookId, source!.id),
    enabled: source !== null,
  });
  return (
    <Dialog open={source !== null} onClose={onClose} title={source?.title ?? t.readerTitle}>
      {source ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-muted">
            {t.sourceKinds[source.kind] ?? source.kind} ·{" "}
            {t.sourceSize(source.char_count, source.page_count)}
            {source.truncated ? ` · ${t.truncated}` : ""}
          </p>
          {detail.isPending ? (
            <LoadingState />
          ) : detail.error ? (
            <Alert tone="danger">{detail.error.message}</Alert>
          ) : (
            <div
              tabIndex={0}
              aria-label={source.title}
              className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-control bg-surface-sunken p-3 text-sm text-ink"
            >
              {detail.data?.content}
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
