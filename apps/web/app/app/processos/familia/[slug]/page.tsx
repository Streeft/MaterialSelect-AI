"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getProcessClass } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/ui";
import { FamilyProseCard } from "@/components/browse/FamilyProse";

const t = ptBR.processes;

/**
 * One process family, read as a record (P1-4).
 *
 * A static `familia` segment rather than sharing `[slug]` with a process: a
 * folder slug and a process slug are different namespaces, which is exactly the
 * separation the API makes between `/processes/classes/{slug}` and
 * `/processes/{slug}`. Two pages that disagreed about which namespace a URL
 * belongs to is a 404 nobody can explain.
 */
export default function ProcessFamilyPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const family = useQuery({
    queryKey: ["process-class", slug],
    queryFn: () => getProcessClass(slug),
    enabled: Boolean(slug),
  });

  if (family.isLoading) return <LoadingState label={t.loading} />;
  if (family.isError) {
    return <ErrorState title={t.familyNotFound} onRetry={() => void family.refetch()} />;
  }
  if (!family.data) return null;

  const data = family.data;
  const hasChildren = data.children.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: t.backToProcesses, href: "/app/processos" },
          ...data.ancestors.map((a) => ({
            label: a.name,
            href: `/app/processos/familia/${a.slug}`,
          })),
          { label: data.name },
        ]}
      />

      <PageHeader title={data.name} description={data.description ?? undefined} group="dados" />

      <FamilyProseCard
        applications={data.applications}
        characteristics={data.characteristics}
      />

      <Section
        id="processos"
        title={t.familiesTitle}
        description={countLine(data.process_count, data.descendant_process_count)}
      >
        {data.processes.length === 0 ? (
          // Absence written out, and the two absences are not the same: a folder
          // whose contents are one level down is not an empty folder.
          <p className="text-sm text-ink-muted">
            {hasChildren ? t.emptyFolderWithChildren : t.emptyFolder}
          </p>
        ) : (
          <Card>
            <CardBody className="flex flex-wrap gap-2">
              {data.processes.map((process) => (
                <Link
                  key={process.slug}
                  href={`/app/processos/${process.slug}`}
                  className="rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Badge tone="brand">{process.name}</Badge>
                </Link>
              ))}
            </CardBody>
          </Card>
        )}
      </Section>

      {hasChildren && (
        <Section id="subfamilias" title={t.subfamilies}>
          <div className="flex flex-wrap gap-2">
            {data.children.map((child) => (
              <Link
                key={child.slug}
                href={`/app/processos/familia/${child.slug}`}
                className="rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Card className="pressable">
                  <CardBody className="flex flex-col gap-0.5 px-4 py-3">
                    <span className="font-medium text-ink">{child.name}</span>
                    <span className="text-xs text-ink-muted">
                      {t.countDirect(child.process_count)}
                    </span>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/**
 * "3 aqui" plus "12 no total" — and the second line only when it says something
 * the first does not. A pure branch reports 0 directly, and without the subtree
 * total the reader has no reason to open it.
 */
function countLine(direct: number, subtree: number): string {
  if (subtree === direct) return t.countDirect(direct);
  return `${t.countDirect(direct)} · ${t.countBelow(subtree)}`;
}
