"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAssembly, listAssemblies } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { ASSEMBLIES_KEY, assemblyKey } from "@/components/projects/keys";
import { Alert, Button, EmptyState, ErrorState, Input, ListSkeleton, PageHeader } from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";

const t = ptBR.projects;

/**
 * Projetos (D-257): the things the reader is designing, each one a list of parts. Creating one
 * goes straight into it — an empty project is where its first part is written.
 */
export default function ProjectsPage() {
  const client = useQueryClient();
  const router = useRouter();
  const projects = useQuery({ queryKey: ASSEMBLIES_KEY, queryFn: listAssemblies });
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => createAssembly(name.trim()),
    onSuccess: async (project) => {
      client.setQueryData(assemblyKey(project.id), project);
      await client.invalidateQueries({ queryKey: ASSEMBLIES_KEY, exact: true });
      router.push(`/app/projetos/${project.id}`);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={`${t.description} ${t.privateNote}`} />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <div className="min-w-0 flex-1 basis-64">
          <Input
            label={t.newLabel}
            placeholder={t.newPlaceholder}
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          icon={<IconPlus />}
          loading={create.isPending}
          disabled={!name.trim()}
        >
          {create.isPending ? t.creating : t.create}
        </Button>
      </form>
      {create.isError ? (
        <Alert tone="danger" role="alert">
          {describeApiError(create.error, t.createError)}
        </Alert>
      ) : null}

      {projects.isPending ? (
        <ListSkeleton label={t.loading} />
      ) : projects.isError ? (
        <ErrorState title={t.error} error={projects.error} onRetry={() => void projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyHint} />
      ) : (
        <ul aria-label={t.listLabel} className="m3-list-segmented">
          {projects.data.map((project) => (
            <li key={project.id}>
              <Link
                href={`/app/projetos/${project.id}`}
                className="m3-state flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3"
              >
                <span className="min-w-0 flex-1 basis-56 break-words text-body font-semibold text-ink">
                  {project.name}
                </span>
                <span className="text-support text-ink-muted">
                  {t.progress(project.chosen_count, project.part_count)}
                </span>
                <span className="text-caption text-ink-muted">
                  {t.changed(formatDate(project.updated_at) ?? "")}
                </span>
                {project.description ? (
                  <span className="basis-full text-support text-ink-muted">{project.description}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
