"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteNotebook, updateNotebook } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { useUndoableDelete, withoutId } from "@/lib/useUndoableDelete";
import type { NotebookSummary } from "@/lib/types";
import { Alert, Card, Input, MenuButton, MenuItem } from "@/components/ui";
import { IconMoreVertical, IconPencil, IconTrash } from "@/components/ui/icons";
import { NOTEBOOKS_KEY, notebookKey } from "./keys";

const t = ptBR.notebooks;

/**
 * One notebook on the list (D-143): the whole card opens it, and a three-dot
 * menu (M3 Cards, "actions") holds the two verbs that are not its point —
 * rename in place and delete with "Desfazer" (D-130). The menu sits beside the
 * link, never inside it: a button nested in an anchor is not valid.
 */
export function NotebookCard({
  notebook,
  index,
}: {
  notebook: NotebookSummary;
  index: number;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const date = formatDate(notebook.updated_at);

  const rename = useMutation({
    mutationFn: (next: string) => updateNotebook(notebook.id, { title: next }),
    onSuccess: (updated) => {
      client.setQueryData(notebookKey(notebook.id), updated);
      void client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
    },
  });
  const undoableDelete = useUndoableDelete();
  const remove = () =>
    undoableDelete({
      what: ptBR.snackbar.notebook,
      hide: [{ queryKey: NOTEBOOKS_KEY, remove: withoutId(notebook.id) }],
      commit: () => deleteNotebook(notebook.id),
    });

  const commit = () => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== notebook.title) rename.mutate(next);
  };

  const meta = (
    <span className="mt-auto text-xs text-ink-muted">
      {t.sourceCount(notebook.source_count)}
      {date ? ` · ${t.updated(date)}` : ""}
    </span>
  );

  return (
    <Card riseIndex={index} className="relative h-full">
      {draft === null ? (
        <Link
          href={`/app/cadernos/${notebook.id}`}
          className="flex h-full flex-col gap-3 p-4 pr-14 hover:bg-brand-50"
        >
          <span aria-hidden className="text-3xl">
            {notebook.emoji}
          </span>
          <span className="text-base font-semibold text-ink">
            {notebook.title}
          </span>
          {meta}
        </Link>
      ) : (
        <div className="flex h-full flex-col gap-3 p-4">
          <span aria-hidden className="text-3xl">
            {notebook.emoji}
          </span>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              commit();
            }}
          >
            <Input
              label=""
              aria-label={t.titleLabel}
              autoFocus
              value={draft}
              maxLength={200}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Escape") setDraft(null);
              }}
            />
          </form>
          {meta}
        </div>
      )}
      <div className="absolute right-2 top-2">
        <MenuButton
          iconOnly
          icon={<IconMoreVertical />}
          label={t.cardMenu(notebook.title)}
        >
          <MenuItem onSelect={() => setDraft(notebook.title)}>
            <span className="inline-flex items-center gap-2">
              <IconPencil /> {t.rename}
            </span>
          </MenuItem>
          <MenuItem onSelect={remove}>
            <span className="inline-flex items-center gap-2">
              <IconTrash /> {t.remove}
            </span>
          </MenuItem>
        </MenuButton>
      </div>
      {rename.error ? (
        <Alert tone="danger" role="alert" className="m-4 mt-0">
          {rename.error.message}
        </Alert>
      ) : null}
    </Card>
  );
}
