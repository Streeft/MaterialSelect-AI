"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { catalogueExportUrl, listClasses, searchMaterials } from "@/lib/api";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { descendantSlugs, roots } from "@/lib/taxonomy";
import { ExportButtons } from "@/components/ExportButtons";
import { MaterialList } from "@/components/catalog/MaterialList";
import { CompositionReport } from "@/components/catalog/CompositionReport";
import { SearchHelp } from "@/components/catalog/SearchHelp";
import {
  Button,
  ButtonLink,
  Card,
  DensityToggle,
  CardBody,
  CardHeader,
  DataQualityLegend,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Select,
  SelectOption,
} from "@/components/ui";

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
  const [search, setSearch] = useState("");
  const [classSlug, setClassSlug] = useState("");
  const [quality, setQuality] = useState<QualityFilter>("any");
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
  const shown = useMemo(() => {
    const all = items ?? [];
    return all.filter(
      (m) => (!classSlug || m.class_slug === classSlug) && matchesQuality(m, quality),
    );
  }, [items, classSlug, quality]);

  const total = items?.length ?? 0;
  const filtered = Boolean(classSlug) || quality !== "any";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        group="dados"
        actions={
          <>
            {/* D-108: a quiet door to a maintenance reading, not a second action. */}
            <ButtonLink href="/app/catalogo/releases" variant="ghost" size="sm">
              {t.releasesLink}
            </ButtonLink>
            <ButtonLink href="/app/materiais/novo" variant="primary" size="sm">
              + {ptBR.actions.new}
            </ButtonLink>
          </>
        }
      />

      <Card>
        <CardHeader headingLevel={2} title={t.filters} />
        {/* One row at lg: the search takes what is left. `className` on a
            field styles its control, not its wrapper, so the columns come from
            the grid; `items-start` keeps the three labels on one line even
            though only the search carries a hint under it. */}
        <CardBody className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]">
          <Input
            label={t.searchLabel}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            hint={t.searchHint}
          />

          <Select
            label={t.filterClass}
            value={classSlug}
            onChange={(e) => setClassSlug(e.target.value)}
          >
            <SelectOption value="">{t.allClasses}</SelectOption>
            {(classes.data ?? []).map((c) => (
              <SelectOption key={c.slug} value={c.slug}>
                {c.name}
              </SelectOption>
            ))}
          </Select>

          <Select
            label={t.filterQuality}
            value={quality}
            onChange={(e) => setQuality(e.target.value as QualityFilter)}
          >
            <SelectOption value="any">{t.qualityAny}</SelectOption>
            <SelectOption value="complete">{t.qualityComplete}</SelectOption>
            <SelectOption value="gaps">{t.qualityWithGaps}</SelectOption>
            <SelectOption value="measured">{t.qualityMeasured}</SelectOption>
            <SelectOption value="referenced">{t.qualityReferenced}</SelectOption>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start lg:mt-[1.4rem]"
            disabled={!filtered && !search}
            onClick={() => {
              setSearch("");
              setClassSlug("");
              setQuality("any");
            }}
          >
            {t.clearFilters}
          </Button>
        </CardBody>
        <CardBody className="pt-0">
          <SearchHelp onUse={setSearch} />
        </CardBody>
      </Card>

      {/* P1-4: the way *into* the taxonomy, next to (not instead of) the filter
          above. The two answer different questions — the select narrows the list
          on this screen, a family card leaves for that family's own page, where
          the record and the subclasses are. Collapsing them into one control
          would cost whichever question lost. */}
      <Section id="familias" title={ptBR.family.subclasses} description={t.browseHint}>
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
                  <span className="text-xs text-ink-muted">
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
            <DensityToggle className="hidden sm:inline-flex" />
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
                    onClick={() => {
                      setClassSlug("");
                      setQuality("any");
                    }}
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
            <MaterialList materials={shown} searchQuery={debouncedSearch} />
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
