"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProcessClass } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Breadcrumb,
  ErrorState,
  LoadingState,
  PageDoc,
  PropertyList,
} from "@/components/ui";
import { IconLayers } from "@/components/ui/icons";
import { fichaText } from "@/lib/i18n-ficha";
import { CollapsibleSection } from "@/components/material/CollapsibleSection";
import { FamilyProseCard } from "@/components/browse/FamilyProse";
import { usePageTitle } from "@/lib/pageTitle";

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

  // D-215: which of the folding sections (D-215) are open; both start open.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // D-207: the tab and the menu's "Recentes" carry the record's own name.
  usePageTitle(family.data?.name);

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

      {/* D-215: the family in the sheets' mould — counts as properties, the
          processes and sub-families in sections that fold. */}
      <PageDoc
        icon={<IconLayers className="h-5 w-5" />}
        title={data.name}
        properties={
          <PropertyList
            items={[
              {
                id: "processos",
                label: fichaText.doc.processesLabel,
                value: countLine(data.process_count, data.descendant_process_count),
              },
              ...(hasChildren
                ? [
                    {
                      id: "subfamilias",
                      label: fichaText.doc.subfamiliesLabel,
                      value: String(data.children.length),
                    },
                  ]
                : []),
            ]}
          />
        }
      >
        {data.description ? (
          <p className="max-w-prose text-body text-ink">{data.description}</p>
        ) : null}

        <FamilyProseCard
          applications={data.applications}
          characteristics={data.characteristics}
        />

        <CollapsibleSection
          id="processos"
          title={fichaText.doc.processesLabel}
          open={open.processos !== false}
          onOpenChange={(next) => setOpen((o) => ({ ...o, processos: next }))}
        >
          {data.processes.length === 0 ? (
            // Absence written out, and the two absences are not the same: a folder
            // whose contents are one level down is not an empty folder.
            <p className="text-body text-ink-muted">
              {hasChildren ? t.emptyFolderWithChildren : t.emptyFolder}
            </p>
          ) : (
            <ul className="divide-y divide-line-divider rounded-card border border-line bg-panel">
              {data.processes.map((process) => (
                <li key={process.slug}>
                  <Link
                    href={`/app/processos/${process.slug}`}
                    className="m3-state flex items-center justify-between gap-2 px-4 py-2.5 text-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
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
        </CollapsibleSection>

        {hasChildren && (
          <CollapsibleSection
            id="subfamilias"
            title={t.subfamilies}
            open={open.subfamilias !== false}
            onOpenChange={(next) => setOpen((o) => ({ ...o, subfamilias: next }))}
          >
            <div className="flex flex-wrap gap-2">
              {data.children.map((child) => (
                <Link
                  key={child.slug}
                  href={`/app/processos/familia/${child.slug}`}
                  className="msds-card m3-state flex flex-col gap-0.5 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  data-interactive="true"
                >
                  <span className="font-medium text-ink">{child.name}</span>
                  <span className="text-caption text-ink-muted">
                    {t.countDirect(child.process_count)}
                  </span>
                </Link>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </PageDoc>
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
