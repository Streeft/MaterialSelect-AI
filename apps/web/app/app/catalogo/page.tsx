"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { catalogueExportUrl, listClasses, listMaterials } from "@/lib/api";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { descendantSlugs, roots } from "@/lib/taxonomy";
import { ExportButtons } from "@/components/ExportButtons";
import { MaterialList } from "@/components/catalog/MaterialList";
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
type QualityFilter = "any" | "complete" | "gaps" | "measured";

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
  }
}

export default function CatalogPage() {
  const [search, setSearch] = useState("");
  const [classSlug, setClassSlug] = useState("");
  const [quality, setQuality] = useState<QualityFilter>("any");
  const debouncedSearch = useDebounced(search, 300);

  const materials = useQuery({
    queryKey: ["materials", debouncedSearch],
    queryFn: () => listMaterials(debouncedSearch),
  });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });

  // Class and quality filter what the server already returned: both are facts
  // the payload carries, so filtering here costs no round trip and no guess.
  const shown = useMemo(() => {
    const all = materials.data ?? [];
    return all.filter(
      (m) => (!classSlug || m.class_slug === classSlug) && matchesQuality(m, quality),
    );
  }, [materials.data, classSlug, quality]);

  const total = materials.data?.length ?? 0;
  const filtered = Boolean(classSlug) || quality !== "any";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        group="dados"
        actions={
          <ButtonLink href="/app/materiais/novo" variant="primary" size="sm">
            + {ptBR.actions.new}
          </ButtonLink>
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
                      (materials.data ?? []).filter((m) =>
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
        {materials.isError && (
          <ErrorState title={t.error} onRetry={() => void materials.refetch()} />
        )}

        {materials.data &&
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
            <MaterialList materials={shown} />
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
