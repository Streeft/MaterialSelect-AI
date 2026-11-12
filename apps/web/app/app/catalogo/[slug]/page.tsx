"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClass, searchMaterials, type CatalogQuery } from "@/lib/api";
import { isNotFound } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import { useUrlState, type UrlCodec, type UrlSpec } from "@/lib/urlState";
import { MaterialList } from "@/components/catalog/MaterialList";
import { FamilyProseCard } from "@/components/browse/FamilyProse";
import { FamilyNote } from "@/components/glossary/FamilyNote";
import {
  Breadcrumb,
  ButtonLink,
  Card,
  CardBody,
  DataQualityLegend,
  ErrorState,
  LoadingState,
  Pagination,
  PageDoc,
  PropertyList,
} from "@/components/ui";
import { IconLayers } from "@/components/ui/icons";
import { fichaText } from "@/lib/i18n-ficha";
import { CollapsibleSection } from "@/components/material/CollapsibleSection";
import { SheetOutline, type OutlineItem } from "@/components/material/SheetOutline";
import { usePageTitle } from "@/lib/pageTitle";

const t = ptBR.catalog;
const f = ptBR.family;

/** D-217: the same page size as the catalogue. */
const FAMILY_PAGE_SIZE = 50;

const pageCodec: UrlCodec<number> = {
  parse: (raw) => (/^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : undefined),
  serialize: (value) => String(value),
};
const FAMILY_URL: UrlSpec<{ pagina: number }> = {
  pagina: { param: "pagina", codec: pageCodec, defaultValue: 1 },
};

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
  // `useSearchParams` (inside `useUrlState`) needs a boundary.
  return (
    <Suspense fallback={<LoadingState />}>
      <MaterialFamilyContent />
    </Suspense>
  );
}

function MaterialFamilyContent() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const family = useQuery({
    queryKey: ["class", slug],
    queryFn: () => getClass(slug),
    enabled: Boolean(slug),
  });
  const [url, setUrl] = useUrlState(FAMILY_URL);
  // D-217: the catalogue's own search is the one source — the class chip
  // already means "this class and everything under it" on the server, and
  // the page is a page, not the whole family.
  const question: CatalogQuery = {
    classe: slug,
    ordenar: "nome",
    limit: FAMILY_PAGE_SIZE,
    offset: (url.pagina - 1) * FAMILY_PAGE_SIZE,
  };
  const materials = useQuery({
    queryKey: ["materials", "busca", question],
    queryFn: () => searchMaterials(question),
    enabled: Boolean(slug),
    placeholderData: (previous) => previous,
  });
  const shown = materials.data?.items ?? [];

  // D-215: which of the folding sections (D-215) are open; all start open.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // D-207: the tab and the menu's "Recentes" carry the record's own name.
  usePageTitle(family.data?.name);

  if (family.isLoading) return <LoadingState label={t.loading} />;
  if (family.isError) {
    // D-200: a family that does not exist (404) is not a failed request. Only
    // the second can be retried; the first has a way out, the catalogue.
    return isNotFound(family.error) ? (
      <ErrorState
        title={f.notFound}
        description={
          <ButtonLink href="/app/catalogo" variant="link" size="sm">
            {f.allClasses}
          </ButtonLink>
        }
      />
    ) : (
      <ErrorState error={family.error} onRetry={() => void family.refetch()} />
    );
  }
  // `enabled: Boolean(slug)` leaves the query idle without a slug; never a blank screen.
  if (!family.data) return <ErrorState title={f.notFound} />;

  const data = family.data;
  const hasChildren = data.children.length > 0;

  const outline: OutlineItem[] = [
    ...(hasChildren ? [{ id: "subclasses", label: f.subclasses }] : []),
    { id: "materiais", label: f.inThisFamily },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: f.allClasses, href: "/app/catalogo" },
          ...data.ancestors.map((a) => ({ label: a.name, href: `/app/catalogo/${a.slug}` })),
          { label: data.name },
        ]}
      />

      {/* D-215: a family is a document page in the sheets' mould — its counts
          as properties, then the sections that fold, with the side index. */}
      <PageDoc
        icon={<IconLayers className="h-5 w-5" />}
        title={data.name}
        properties={
          <PropertyList
            items={[
              {
                id: "materiais",
                label: fichaText.doc.materialsLabel,
                value: countLine(data.material_count, data.descendant_material_count),
              },
              ...(hasChildren
                ? [
                    {
                      id: "subclasses",
                      label: f.subclasses,
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

        {/* D-151: the conceptual note for this class, folded, as on the
            material sheet; the same query the sheet and the glossary use. */}
        <FamilyNote slug={data.slug} name={data.name} className="max-w-prose" />

        <FamilyProseCard
          applications={data.applications}
          characteristics={data.characteristics}
        />

        <div className="sheet-layout">
          <div className="sheet-grid">
          <SheetOutline
            items={outline}
            label={fichaText.doc.familyOutline}
            title={fichaText.doc.familyOutlineTitle}
            onNavigate={(id) => setOpen((o) => ({ ...o, [id]: true }))}
          />
          <div className="flex min-w-0 flex-col gap-6">
            {hasChildren && (
              <CollapsibleSection
                id="subclasses"
                title={f.subclasses}
                open={open.subclasses !== false}
                onOpenChange={(next) => setOpen((o) => ({ ...o, subclasses: next }))}
              >
                <div className="flex flex-wrap gap-2">
                  {data.children.map((child) => (
                    <Link
                      key={child.slug}
                      href={`/app/catalogo/${child.slug}`}
                      className="msds-card m3-state flex flex-col gap-0.5 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      data-interactive="true"
                    >
                      <span className="font-medium text-ink">{child.name}</span>
                      <span className="text-caption text-ink-muted">
                        {f.countDirect(child.material_count)}
                      </span>
                    </Link>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection
              id="materiais"
              title={f.inThisFamily}
              open={open.materiais !== false}
              onOpenChange={(next) => setOpen((o) => ({ ...o, materiais: next }))}
            >
              {materials.isLoading && <LoadingState label={t.loading} />}
              {materials.isError ? (
                // D-200: a failed query is not an empty folder. Saying "nenhum material"
                // here would be data absence invented out of a network error.
                <ErrorState error={materials.error} onRetry={() => void materials.refetch()} />
              ) : shown.length === 0 && !materials.isLoading ? (
                // Two absences, and they are not the same sentence: a folder whose
                // contents are one level down is not an empty folder.
                <p className="text-body text-ink-muted">
                  {hasChildren ? f.emptyFolderWithChildren : f.emptyFolder}
                </p>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  <MaterialList materials={shown} />
                  <Pagination
                    page={url.pagina}
                    pageSize={FAMILY_PAGE_SIZE}
                    total={materials.data?.total ?? 0}
                    onPage={(pagina) => setUrl({ pagina })}
                    rangeLabel={t.pageRange}
                  />
                </div>
              )}

              <Card>
                <CardBody>
                  <DataQualityLegend />
                </CardBody>
              </Card>
            </CollapsibleSection>

          </div>
          </div>
        </div>
      </PageDoc>
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
