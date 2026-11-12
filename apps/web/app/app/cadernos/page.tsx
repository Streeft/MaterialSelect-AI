"use client";

import { describeApiError } from "@/lib/errors";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNotebook, listNotebooks } from "@/lib/api";
import { useUrlState } from "@/lib/urlState";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  EmptyState,
  ErrorState,
  ButtonGroup,
  ButtonGroupItem,
  ListSkeleton,
  PageHeader,
} from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
import { NotebookCard } from "@/components/notebooks/NotebookCard";
import { NOTEBOOKS_KEY, notebookKey } from "@/components/notebooks/keys";
import { notebooksListUrlSpec } from "@/components/notebooks/urlState";

const t = ptBR.notebooks;

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
  const create = useMutation({
    mutationFn: () => createNotebook(),
    onSuccess: async (notebook) => {
      client.setQueryData(notebookKey(notebook.id), notebook);
      await client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
      router.push(`/app/cadernos/${notebook.id}`);
    },
  });

  const createButton = (
    <Button
      icon={<IconPlus />}
      loading={create.isPending}
      onClick={() => create.mutate()}
    >
      {create.isPending ? t.creating : t.create}
    </Button>
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
          <ButtonGroup label={t.listViews}>
            <ButtonGroupItem
              selected={!archived}
              label={t.viewActive}
              onClick={() => setView({ archived: false })}
            />
            <ButtonGroupItem
              selected={archived}
              label={t.viewArchived}
              onClick={() => setView({ archived: true })}
            />
          </ButtonGroup>
        }
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
          title={archived ? t.archivedEmptyTitle : t.emptyTitle}
          description={archived ? t.archivedEmptyDescription : t.emptyDescription}
          action={archived ? undefined : createButton}
        />
      ) : (
        <ul
          aria-label={t.listLabel}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {notebooks.data.map((notebook, index) => (
            <li key={notebook.id}>
              <NotebookCard notebook={notebook} index={index} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
