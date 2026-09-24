"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listProcessClasses, listProcesses } from "@/lib/api";
import type { Process, ProcessClass } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { descendantSlugs, roots } from "@/lib/taxonomy";
import {
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/ui";

const t = ptBR.processes;

/**
 * The process universe's front door (P1-4).
 *
 * It had none: the second universe was reachable only from inside a selection
 * stage and from a material's datasheet, which made it something you *use* and
 * never something you *browse* — the gap the method's browse step is about.
 *
 * Grouped by root family rather than listed flat, because the family is the
 * first question the method asks about a process ("conforma, une ou trata?"),
 * and because a flat list of thirteen is already a list nobody reads.
 */
export default function ProcessesPage() {
  const classes = useQuery({ queryKey: ["process-classes"], queryFn: listProcessClasses });
  const processes = useQuery({ queryKey: ["processes"], queryFn: listProcesses });

  const loading = classes.isLoading || processes.isLoading;
  const failed = classes.isError || processes.isError;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} group="dados" />

      {loading && <LoadingState label={t.loading} />}
      {failed && (
        <ErrorState
          title={t.error}
          onRetry={() => {
            void classes.refetch();
            void processes.refetch();
          }}
        />
      )}

      {classes.data && processes.data && (
        <Section id="familias" title={t.familiesTitle}>
          {classes.data.length === 0 ? (
            <EmptyState title={t.empty} />
          ) : (
            // A grid, not a stack: three families at full width were three
            // thin strips of tiny badges with the right half of each empty.
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {roots(classes.data).map((root) => (
                <FamilyCard
                  key={root.slug}
                  family={root}
                  classes={classes.data}
                  processes={processes.data}
                />
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function FamilyCard({
  family,
  classes,
  processes,
}: {
  family: ProcessClass;
  classes: ProcessClass[];
  processes: Process[];
}) {
  // Everything under this root, the root included — the reader wants the
  // family's processes, not only the ones that happen to be filed at its top.
  const subtree = descendantSlugs(family.slug, classes);
  const inFamily = processes.filter((p) => subtree.has(p.class_slug));

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link
            href={`/app/processos/familia/${family.slug}`}
            className="rounded-control text-base font-semibold text-ink underline-offset-2 hover:text-brand-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {family.name}
          </Link>
          <span className="text-sm text-ink-muted">{t.countProcesses(inFamily.length)}</span>
        </div>

        {inFamily.length === 0 ? (
          // Written out, never a blank card: an empty family is a state.
          <p className="text-sm text-ink-muted">{t.emptyFolder}</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {inFamily.map((process) => (
              <li key={process.slug}>
                <Link
                  href={`/app/processos/${process.slug}`}
                  className="flex items-center justify-between gap-2 rounded-control px-2 py-1.5 text-sm text-ink transition hover:bg-brand-50 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span>{process.name}</span>
                  <span aria-hidden className="text-ink-subtle">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

