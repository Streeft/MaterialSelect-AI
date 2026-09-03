"use client";

import { useQuery } from "@tanstack/react-query";
import { listStudies } from "@/lib/api";
import { countLabel, formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import {
  Badge,
  ButtonLink,
  EmptyState,
  ErrorState,
  LoadingState,
  Section,
} from "@/components/ui";

const t = ptBR.home;

/**
 * Saved studies, on the way in.
 *
 * The proposal (§4.2) asks for analyses that can be reopened; they were only
 * reachable from the bottom of the wizard that created them, which is the one
 * screen a returning reader has no reason to scroll. Resuming is a link, not a
 * button: it is navigation, and it survives middle-click and "open in new tab".
 */
export function SavedStudies() {
  const studies = useQuery({ queryKey: ["studies"], queryFn: listStudies });

  return (
    <Section title={t.savedTitle} description={t.savedHint}>
      {studies.isPending && <LoadingState />}

      {studies.isError && (
        <ErrorState description={t.savedError} onRetry={() => studies.refetch()} />
      )}

      {studies.data?.length === 0 && (
        <EmptyState
          title={t.savedEmpty}
          description={t.savedEmptyHint}
          action={<ButtonLink href="/app/selecao">{ptBR.nav.selection}</ButtonLink>}
        />
      )}

      {studies.data && studies.data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {studies.data.map((study) => {
            const created = formatDate(study.created_at);
            return (
              <li
                key={study.id}
                className="flex flex-col gap-2 rounded-card border border-edge bg-surface-raised p-4 shadow-card"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink" title={study.name}>
                    {study.name}
                  </p>
                  {created && <p className="text-2xs text-ink-muted">{created}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge>
                    {countLabel(study.constraint_count, t.constraintOne, t.constraintMany)}
                  </Badge>
                  <Badge>
                    {countLabel(study.criterion_count, t.criterionOne, t.criterionMany)}
                  </Badge>
                </div>
                <ButtonLink
                  href={`/app/selecao?estudo=${study.id}`}
                  size="sm"
                  variant="secondary"
                  className="self-start"
                >
                  {t.resume}
                </ButtonLink>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
