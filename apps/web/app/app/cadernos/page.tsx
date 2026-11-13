"use client";

import { describeApiError } from "@/lib/errors";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  batchArchiveNotebooks,
  createNotebook,
  listNotebookTemplates,
  listNotebooks,
} from "@/lib/api";
import type { NotebookTemplateId } from "@/lib/types";
import { useUrlState } from "@/lib/urlState";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ButtonGroup,
  ButtonGroupItem,
  ListSkeleton,
  MenuItem,
  PageHeader,
  SplitButton,
} from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
import { NotebookCard } from "@/components/notebooks/NotebookCard";
import { NOTEBOOKS_KEY, notebookKey } from "@/components/notebooks/keys";
import { notebooksListUrlSpec } from "@/components/notebooks/urlState";

const t = ptBR.notebooks;
const c = curadoriaText.notebooks;

/**
 * Cadernos (D-92): the student's notebooks, newest first. Creating one goes
 * straight into it — an empty notebook is where its sources are added.
 */
export default function NotebooksPage() {
  const client = useQueryClient();
  const router = useRouter();
  // D-218: the archived ones are a view of the same list, kept in the address.
  const [{ archived }, setView] = useUrlState(notebooksListUrlSpec);
  const notebooks = useQuery({
    queryKey: [...NOTEBOOKS_KEY, archived ? "arquivados" : "ativos"],
    queryFn: () => listNotebooks(archived),
  });
  // D-235b: the ready-made notebooks. If they do not load, "Criar caderno" still
  // creates a blank one — the gallery is a shortcut, never the only door.
  const templates = useQuery({
    queryKey: [...NOTEBOOKS_KEY, "modelos"],
    queryFn: listNotebookTemplates,
    staleTime: Infinity,
  });
  const starters = (templates.data ?? []).filter((template) => template.id !== "branco");
  const create = useMutation({
    mutationFn: (template?: NotebookTemplateId) => createNotebook(undefined, template),
    onSuccess: async (notebook) => {
      client.setQueryData(notebookKey(notebook.id), notebook);
      await client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
      router.push(`/app/cadernos/${notebook.id}`);
    },
  });

  // D-233: select several, archive (or bring back) them together, with a confirmation and "Desfazer".
  const snackbar = useOptionalSnackbar();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const visible = notebooks.data ?? [];
  // A selection the list no longer shows (another view, a refetch) is not acted on.
  const chosen = visible.filter((notebook) => picked.has(notebook.id));
  const batch = useMutation({
    mutationFn: ({ ids, archived }: { ids: number[]; archived: boolean }) =>
      batchArchiveNotebooks(ids, archived),
    onSuccess: (_rows, { ids, archived }) => {
      void client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
      snackbar?.notify({
        message: archived ? c.archivedMany(ids.length) : c.unarchivedMany(ids.length),
        // "Desfazer" is the same call the other way round.
        action: {
          label: ptBR.snackbar.undo,
          onAction: () => batch.mutate({ ids, archived: !archived }),
        },
      });
    },
  });
  const toggle = (id: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const leaveSelection = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const runBatch = () => {
    setConfirming(false);
    const ids = chosen.map((notebook) => notebook.id);
    setPicked(new Set());
    if (ids.length > 0) batch.mutate({ ids, archived: !archived });
  };

  const blankButton = (
    <Button icon={<IconPlus />} loading={create.isPending} onClick={() => create.mutate(undefined)}>
      {create.isPending ? t.creating : t.create}
    </Button>
  );
  const createButton =
    starters.length > 0 ? (
      <SplitButton
        variant="primary"
        loading={create.isPending}
        onClick={() => create.mutate(undefined)}
        menuLabel={t.fromTemplate}
        menu={starters.map((template) => (
          <MenuItem
            key={template.id}
            onSelect={() => create.mutate(template.id)}
            hint={template.description}
          >
            {`${template.emoji} ${template.title}`}
          </MenuItem>
        ))}
      >
        {create.isPending ? t.creating : t.create}
      </SplitButton>
    ) : (
      blankButton
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        group={ptBR.nav.groupStudy.toLowerCase()}
        title={t.title}
        description={`${t.description} ${t.privateNote}`}
        // The empty state carries its own button: two identical ones on one screen is noise (D-156).
        primaryAction={
          notebooks.data?.length === 0 && !archived ? undefined : createButton
        }
        secondaryActions={
          <span className="inline-flex flex-wrap items-center gap-2">
            {visible.length > 0 ? (
              <Button
                variant="secondary"
                aria-pressed={selecting}
                onClick={() => (selecting ? leaveSelection() : setSelecting(true))}
              >
                {selecting ? c.selectDone : c.select}
              </Button>
            ) : null}
            <ButtonGroup label={t.listViews}>
              <ButtonGroupItem
                selected={!archived}
                label={t.viewActive}
                onClick={() => {
                  leaveSelection();
                  setView({ archived: false });
                }}
              />
              <ButtonGroupItem
                selected={archived}
                label={t.viewArchived}
                onClick={() => {
                  leaveSelection();
                  setView({ archived: true });
                }}
              />
            </ButtonGroup>
          </span>
        }
      />
      {selecting ? (
        <div
          role="group"
          aria-label={c.selected(chosen.length)}
          className="flex flex-wrap items-center gap-2 rounded-control bg-surface-sunken px-3 py-2"
        >
          <span className="text-body text-ink" aria-live="polite">
            {c.selected(chosen.length)}
          </span>
          <Button
            size="sm"
            variant="tonal"
            disabled={chosen.length === 0}
            loading={batch.isPending}
            onClick={() => setConfirming(true)}
          >
            {archived ? c.unarchiveSelected : c.archiveSelected}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPicked(new Set(visible.map((notebook) => notebook.id)))}
          >
            {c.selectAll}
          </Button>
          <Button size="sm" variant="ghost" disabled={chosen.length === 0} onClick={() => setPicked(new Set())}>
            {c.clear}
          </Button>
        </div>
      ) : null}
      {batch.error ? (
        <Alert tone="danger" role="alert">
          {describeApiError(batch.error, c.batchFailed)}
        </Alert>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={archived ? c.confirmUnarchiveTitle(chosen.length) : c.confirmArchiveTitle(chosen.length)}
        message={archived ? c.confirmUnarchiveMessage : c.confirmArchiveMessage}
        confirmLabel={archived ? c.unarchiveSelected : c.archiveSelected}
        onCancel={() => setConfirming(false)}
        onConfirm={runBatch}
      />
      {create.error ? (
        <Alert tone="danger" role="alert">
          {describeApiError(create.error)}
        </Alert>
      ) : null}
      {notebooks.isPending ? (
        <ListSkeleton variant="cards" />
      ) : notebooks.error ? (
        <ErrorState error={notebooks.error}
          onRetry={() => void notebooks.refetch()}
        />
      ) : notebooks.data.length === 0 ? (
        <EmptyState
          layout={archived ? "inline" : "page"}
          title={archived ? t.archivedEmptyTitle : t.emptyTitle}
          description={archived ? t.archivedEmptyDescription : t.emptyDescription}
          // The models are already on the page below: the button is the blank one.
          action={archived ? undefined : blankButton}
          // D-235b: Notion's empty page — start from a model, not from a blank.
          templates={
            archived
              ? undefined
              : starters.map((template) => ({
                  label: `${template.emoji} ${template.title}`,
                  description: t.templateHint(template.description, template.note_titles),
                  onSelect: () => create.mutate(template.id),
                }))
          }
        />
      ) : (
        <ul
          aria-label={t.listLabel}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {notebooks.data.map((notebook, index) => (
            <li key={notebook.id}>
              <NotebookCard
                notebook={notebook}
                index={index}
                selection={
                  selecting
                    ? { checked: picked.has(notebook.id), onToggle: () => toggle(notebook.id) }
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
