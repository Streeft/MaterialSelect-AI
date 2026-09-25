"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNotebook, listNotebooks } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
import { NOTEBOOKS_KEY, notebookKey } from "@/components/notebooks/keys";

const t = ptBR.notebooks;

/**
 * Cadernos (D-90): the student's notebooks, newest first. Creating one goes
 * straight into it — an empty notebook is where its sources are added.
 */
export default function NotebooksPage() {
  const client = useQueryClient();
  const router = useRouter();
  const notebooks = useQuery({ queryKey: NOTEBOOKS_KEY, queryFn: listNotebooks });
  const create = useMutation({
    mutationFn: () => createNotebook(),
    onSuccess: async (notebook) => {
      client.setQueryData(notebookKey(notebook.id), notebook);
      await client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
      router.push(`/app/cadernos/${notebook.id}`);
    },
  });

  const createButton = (
    <Button icon={<IconPlus />} loading={create.isPending} onClick={() => create.mutate()}>
      {create.isPending ? t.creating : t.create}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        group={ptBR.nav.groupStudy.toLowerCase()}
        title={t.title}
        description={`${t.description} ${t.privateNote}`}
        actions={createButton}
      />
      {create.error ? (
        <Alert tone="danger" role="alert">
          {create.error.message}
        </Alert>
      ) : null}
      {notebooks.isPending ? (
        <LoadingState />
      ) : notebooks.error ? (
        <ErrorState description={notebooks.error.message} onRetry={() => void notebooks.refetch()} />
      ) : notebooks.data.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyDescription} action={createButton} />
      ) : (
        <ul aria-label={t.listLabel} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notebooks.data.map((notebook, index) => {
            const date = formatDate(notebook.updated_at);
            return (
              <li key={notebook.id}>
                <Card riseIndex={index} className="h-full">
                  <Link
                    href={`/app/cadernos/${notebook.id}`}
                    className="flex h-full flex-col gap-3 p-4 hover:bg-brand-50"
                  >
                    <span aria-hidden className="text-3xl">
                      {notebook.emoji}
                    </span>
                    <span className="text-base font-semibold text-ink">{notebook.title}</span>
                    <span className="mt-auto text-xs text-ink-muted">
                      {t.sourceCount(notebook.source_count)}
                      {date ? ` · ${t.updated(date)}` : ""}
                    </span>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
