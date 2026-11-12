"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { catalogueExportUrl, listClasses, searchMaterials } from "@/lib/api";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { descendantSlugs, roots } from "@/lib/taxonomy";
import { ExportButtons } from "@/components/ExportButtons";
import { MaterialList } from "@/components/catalog/MaterialList";
import { MaterialCards, MaterialLines } from "@/components/catalog/MaterialCards";
import { MaterialPreview } from "@/components/catalog/MaterialPreview";
import { PaneScaffold } from "@/components/layout/PaneScaffold";
import { useAnnounce } from "@/components/ui/Announcer";
import { BREAKPOINT_MIN } from "@/lib/design/breakpoints";
import { CompositionReport } from "@/components/catalog/CompositionReport";
import { SearchHelp } from "@/components/catalog/SearchHelp";
import {
  Button,
  ButtonLink,
  Card,
  DensityToggle,
  CardBody,
  DataQualityLegend,
  EmptyState,
  ErrorState,
  FilterBar,
  Input,
  LoadingState,
  PageHeader,
  SavedViewsBar,
  Section,
  VIEW_KIND_LABEL,
  type FilterField,
} from "@/components/ui";
import { useDatabaseView } from "@/lib/savedViews";

import { useDebounced } from "@/lib/useDebounced";

const t = ptBR.catalog;

/**
 * The quality filter, in the terms a reader thinks in.
 *
 * Not a filter by the enum: "estimado" alone is rarely the question. What a
 * student asks is whether a material's data has holes in it, and whether
 * anything in it was actually measured.
 */
type QualityFilter = "any" | "complete" | "gaps" | "measured" | "referenced";

const QUALITY_VALUES: readonly QualityFilter[] = ["complete", "gaps", "measured", "referenced"];

function matchesQuality(material: MaterialListItem, filter: QualityFilter): boolean {
  const q = material.quality;
  switch (filter) {
    case "any":
      return true;
    case "complete":
      return q.missing === 0 && q.medido + q.importado + q.estimado > 0;
    case "gaps":
      return q.missing > 0;
    case "measured":
      return q.medido > 0;
    case "referenced":
      return (material.reference_count ?? 0) > 0;
  }
}

/**
 * A 400 from the search is the reader's query, refused with the reason in
 * Portuguese (D-55, D-105) — shown as such and never retried. Read by shape
 * rather than by `instanceof ApiError`, which every test mock of the API would
 * otherwise have to re-export.
 */
function isQueryRejection(error: unknown): error is Error & { status: 400 } {
  return error instanceof Error && (error as { status?: unknown }).status === 400;
}

export default function CatalogPage() {
  // `useSearchParams` needs a boundary, or `next build` refuses the page.
  return (
    <Suspense fallback={<LoadingState />}>
      <CatalogPageContent />
    </Suspense>
  );
}

function CatalogPageContent() {
  // D-193: the panel links here filtered — `?classe=` (with its descendants)
  // and `?subclasse=`. Read once, as the starting state; the controls own it
  // from then on.
  const params = useSearchParams();
  const [search, setSearch] = useState(() => params.get("busca") ?? "");
  // D-209: the filters live with the screen's saved views (tabs in the
  // reader's account); a tab applies its filters, "Salvar na visão" stores
  // the current ones. What they filter is unchanged: the list the server sent.
  const view = useDatabaseView<"classe" | "subclasse" | "qualidade">({
    scope: "catalogo",
    initialFilters: {
      classe: params.get("classe") || null,
      subclasse: params.get("subclasse") || null,
      qualidade: null,
    },
    defaultKind: "table",
  });
  const classSlug = view.filters.classe ?? "";
  const subclass = view.filters.subclasse ?? "";
  const quality: QualityFilter = QUALITY_VALUES.includes(view.filters.qualidade as QualityFilter)
    ? (view.filters.qualidade as QualityFilter)
    : "any";
  const debouncedSearch = useDebounced(search, 300);

  // D-105: the search endpoint, so a composition query can say which rule ran
  // and how many materials were left out for lack of data. Same matching as
  // `listMaterials`; the key keeps the "materials" prefix every invalidation
  // already targets.
  const materials = useQuery({
    queryKey: ["materials", "busca", debouncedSearch],
    queryFn: () => searchMaterials(debouncedSearch),
    // Keep the last good list on screen while the next query loads.
    placeholderData: (previous) => previous,
    retry: (count, error) => !isQueryRejection(error) && count < 2,
  });
  const items = materials.data?.items;
  const queryError = isQueryRejection(materials.error) ? materials.error.message : null;
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });

  // Class and quality filter what the server already returned: both are facts
  // the payload carries, so filtering here costs no round trip and no guess.
  // A class from the panel means the class and everything under it, as on the
  // family page; one picked in the select matches the same way.
  const classSet = useMemo(
    () => (classSlug ? descendantSlugs(classSlug, classes.data ?? []) : null),
    [classSlug, classes.data],
  );
  const shown = useMemo(() => {
    const all = items ?? [];
    return all.filter(
      (m) =>
        (!classSet || classSet.has(m.class_slug) || m.class_slug === classSlug) &&
        (!subclass || m.subclass === subclass) &&
        matchesQuality(m, quality),
    );
  }, [items, classSet, classSlug, subclass, quality]);

  const total = items?.length ?? 0;
  const filtered = Boolean(classSlug) || Boolean(subclass) || quality !== "any";

  // D-184: list-detail. A plain click on a name shows the material beside the
  // list when the list's own block is wide enough for two panes (the same 840 px
  // the scaffold's container query uses); otherwise the link navigates as before.
  // A preview whose material leaves the list (a filter) simply closes.
  const listRef = useRef<HTMLDivElement>(null);
  const announce = useAnnounce();
  const [previewId, setPreviewId] = useState<number | null>(null);
  const previewItem = shown.find((m) => m.id === previewId) ?? null;
  const requestPreview = (id: number) => {
    const width = listRef.current?.getBoundingClientRect().width ?? 0;
    if (width < BREAKPOINT_MIN.expanded) return false;
    setPreviewId(id);
    const name = shown.find((m) => m.id === id)?.name;
    if (name) announce(t.preview.opened(name));
    return true;
  };

  // The subclass is offered among the ones the list actually has, so a chip
  // never offers a value that empties the screen.
  const subclasses = useMemo(
    () =>
      [...new Set((items ?? []).map((m) => m.subclass).filter((x): x is string => Boolean(x)))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [items],
  );
  const filterFields: FilterField[] = [
    {
      id: "classe",
      label: t.filterClass,
      pinned: true,
      value: view.filters.classe,
      options: (classes.data ?? []).map((c) => ({ value: c.slug, label: c.name })),
    },
    {
      id: "qualidade",
      label: t.filterQuality,
      pinned: true,
      value: quality === "any" ? null : quality,
      options: [
        { value: "complete", label: t.qualityComplete },
        { value: "gaps", label: t.qualityWithGaps },
        { value: "measured", label: t.qualityMeasured },
        { value: "referenced", label: t.qualityReferenced },
      ],
    },
    {
      id: "subclasse",
      label: t.subclassLabel,
      value: view.filters.subclasse,
      options: subclasses.map((name) => ({ value: name, label: name })),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        secondaryActions={
          // D-108: a quiet door to a maintenance reading, not a second action.
          <ButtonLink href="/app/catalogo/releases" variant="ghost" size="sm">
            {t.releasesLink}
          </ButtonLink>
        }
        primaryAction={
          <ButtonLink href="/app/materiais/novo" variant="primary" size="sm">
            + {ptBR.actions.new}
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-3">
        <SavedViewsBar
          views={view.saved.views}
          activeId={view.activeId}
          onSelect={view.select}
          onCreate={(kind) =>
            view.create(kind, `${VIEW_KIND_LABEL[kind]} ${view.saved.views.length + 1}`)
          }
          onRename={view.rename}
          onDelete={view.remove}
          dirty={view.dirty}
          onSaveChanges={view.saveChanges}
        />
        <Input
          label={t.searchLabel}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          hint={t.searchHint}
        />
        <FilterBar
          fields={filterFields}
          onChange={(id, value) =>
            view.setFilter(id as "classe" | "subclasse" | "qualidade", value)
          }
          onClear={view.clearFilters}
        />
        <SearchHelp onUse={setSearch} />
      </div>

      {/* P1-4: the way *into* the taxonomy, next to (not instead of) the filter
          above. The two answer different questions — the select narrows the list
          on this screen, a family card leaves for that family's own page, where
          the record and the subclasses are. Collapsing them into one control
          would cost whichever question lost. */}
      <Section id="familias" title={ptBR.family.families} description={t.browseHint}>
        <div className="flex flex-wrap gap-2">
          {roots(classes.data ?? []).map((family) => (
            <Link
              key={family.slug}
              href={`/app/catalogo/${family.slug}`}
              className="rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Card className="pressable">
                <CardBody className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="font-medium text-ink">{family.name}</span>
                  <span className="text-caption text-ink-muted">
                    {ptBR.family.countMaterials(
                      (items ?? []).filter((m) =>
                        descendantSlugs(family.slug, classes.data ?? []).has(m.class_slug),
                      ).length,
                    )}
                  </span>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        id="materiais"
        title={t.count(shown.length)}
        description={shown.length === total ? undefined : t.showing(shown.length, total)}
        actions={
          <>
            {/* The table exists from `sm` up; the cards below it have no rows to densify. */}
            {view.kind === "table" ? <DensityToggle className="hidden sm:inline-flex" /> : null}
            <ExportButtons urlFor={catalogueExportUrl} label={ptBR.exports.catalogue} />
          </>
        }
      >
        {materials.isLoading && <LoadingState label={t.loading} />}
        {materials.isError &&
          (queryError ? (
            <ErrorState title={t.searchError} description={queryError} />
          ) : (
            <ErrorState title={t.error} onRetry={() => void materials.refetch()} />
          ))}
        {!materials.isError && materials.data?.composition && (
          <CompositionReport report={materials.data.composition} />
        )}

        {items &&
          (shown.length === 0 ? (
            <EmptyState
              title={filtered ? t.emptyFiltered : t.empty}
              description={filtered ? undefined : t.emptyHint}
              action={
                filtered ? (
                  <Button
                    size="sm"
                    onClick={view.clearFilters}
                  >
                    {t.clearFilters}
                  </Button>
                ) : (
                  <ButtonLink href="/app/materiais/novo" size="sm" variant="primary">
                    + {ptBR.actions.new}
                  </ButtonLink>
                )
              }
            />
          ) : (
            <div ref={listRef}>
              {previewItem ? (
                <PaneScaffold
                  layout="list-detail"
                  focus="secondary"
                  primaryLabel={t.preview.list}
                  secondaryLabel={t.preview.region}
                  primary={
                    <MaterialList
                      materials={shown}
                      searchQuery={debouncedSearch}
                      onPreview={requestPreview}
                      previewId={previewItem.id}
                      compact
                    />
                  }
                  secondary={
                    <MaterialPreview
                      key={previewItem.id}
                      item={previewItem}
                      onClose={() => setPreviewId(null)}
                    />
                  }
                />
              ) : view.kind === "gallery" ? (
                <MaterialCards materials={shown} searchQuery={debouncedSearch} layout="gallery" />
              ) : view.kind === "list" ? (
                <MaterialLines materials={shown} searchQuery={debouncedSearch} />
              ) : (
                <MaterialList
                  materials={shown}
                  searchQuery={debouncedSearch}
                  onPreview={requestPreview}
                />
              )}
            </div>
          ))}

        {/* The legend belongs on the screen that shows many values at once —
            the badges above are only readable if the vocabulary is at hand. */}
        <Card>
          <CardBody>
            <DataQualityLegend />
          </CardBody>
        </Card>
      </Section>
    </div>
  );
}
