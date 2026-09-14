"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listProcessClasses, listProcesses } from "@/lib/api";
import type { Process, ProcessClass } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Badge,
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
            <div className="flex flex-col gap-3">
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

/** The taxonomy's roots, which is where the reader starts. */
function roots(classes: ProcessClass[]): ProcessClass[] {
  return classes.filter((c) => c.parent_id === null);
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
  const subtree = descendantSlugs(family, classes);
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
          <div className="flex flex-wrap gap-2">
            {inFamily.map((process) => (
              <Link
                key={process.slug}
                href={`/app/processos/${process.slug}`}
                className="rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Badge tone="brand">{process.name}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Every slug at or under `family`.
 *
 * Walked breadth-first over `parent_id` rather than assuming two levels: the
 * taxonomy is data, an operator can deepen it without a migration (D-57), and a
 * hard-coded depth would silently drop whatever they add.
 */
function descendantSlugs(family: ProcessClass, classes: ProcessClass[]): Set<string> {
  const slugs = new Set([family.slug]);
  const ids = new Set([family.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of classes) {
      if (candidate.parent_id !== null && ids.has(candidate.parent_id) && !ids.has(candidate.id)) {
        ids.add(candidate.id);
        slugs.add(candidate.slug);
        grew = true;
      }
    }
  }
  return slugs;
}
