"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClass, listClasses, listMaterials } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { descendantSlugs } from "@/lib/taxonomy";
import { MaterialList } from "@/components/catalog/MaterialList";
import { FamilyProseCard } from "@/components/browse/FamilyProse";
import {
  Breadcrumb,
  Card,
  CardBody,
  DataQualityLegend,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/ui";

const t = ptBR.catalog;
const f = ptBR.family;

/**
 * One material family, read as a record (P1-4).
 *
 * The materials shown are those of the family **and everything under it**, not
 * only the ones filed at this exact level. A reader who opens "Metais" wants
 * metals; a branch that is a pure folder would otherwise render an empty page
 * and send them hunting through subclasses for the contents they asked for. The
 * subclass cards are how they narrow from here, and the count line says both
 * numbers so neither reading is hidden.
 */
export default function MaterialFamilyPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const family = useQuery({
    queryKey: ["class", slug],
    queryFn: () => getClass(slug),
    enabled: Boolean(slug),
  });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const materials = useQuery({ queryKey: ["materials", ""], queryFn: () => listMaterials("") });

  const subtree = useMemo(
    () => descendantSlugs(slug, classes.data ?? []),
    [slug, classes.data],
  );
  const shown = useMemo(
    () => (materials.data ?? []).filter((m) => subtree.has(m.class_slug)),
    [materials.data, subtree],
  );

  if (family.isLoading) return <LoadingState label={t.loading} />;
  if (family.isError) {
    return <ErrorState title={f.notFound} onRetry={() => void family.refetch()} />;
  }
  if (!family.data) return null;

  const data = family.data;
  const hasChildren = data.children.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: f.allClasses, href: "/app/catalogo" },
          ...data.ancestors.map((a) => ({ label: a.name, href: `/app/catalogo/${a.slug}` })),
          { label: data.name },
        ]}
      />

      <PageHeader title={data.name} description={data.description ?? undefined} group="dados" />

      <FamilyProseCard
        applications={data.applications}
        characteristics={data.characteristics}
      />

      {hasChildren && (
        <Section id="subclasses" title={f.subclasses}>
          <div className="flex flex-wrap gap-2">
            {data.children.map((child) => (
              <Link
                key={child.slug}
                href={`/app/catalogo/${child.slug}`}
                className="rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Card className="pressable">
                  <CardBody className="flex flex-col gap-0.5 px-4 py-3">
                    <span className="font-medium text-ink">{child.name}</span>
                    <span className="text-xs text-ink-muted">
                      {f.countDirect(child.material_count)}
                    </span>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section
        id="materiais"
        title={f.inThisFamily}
        description={countLine(data.material_count, data.descendant_material_count)}
      >
        {materials.isLoading && <LoadingState label={t.loading} />}
        {shown.length === 0 && !materials.isLoading ? (
          // Two absences, and they are not the same sentence: a folder whose
          // contents are one level down is not an empty folder.
          <p className="text-sm text-ink-muted">
            {hasChildren ? f.emptyFolderWithChildren : f.emptyFolder}
          </p>
        ) : (
          <MaterialList materials={shown} />
        )}

        <Card>
          <CardBody>
            <DataQualityLegend />
          </CardBody>
        </Card>
      </Section>
    </div>
  );
}

/**
 * "3 aqui" plus "12 no total" — the second half only when it says something the
 * first does not. A pure branch reports 0 directly, and the subtree total is the
 * only thing that tells the reader there is anything to find below.
 */
function countLine(direct: number, subtree: number): string {
  if (subtree === direct) return f.countDirect(direct);
  return `${f.countDirect(direct)} · ${f.countBelow(subtree)}`;
}
