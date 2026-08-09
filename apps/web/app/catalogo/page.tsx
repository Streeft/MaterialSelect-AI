"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { catalogueExportUrl, listClasses, listMaterials } from "@/lib/api";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { ExportButtons } from "@/components/ExportButtons";
import { MaterialCards, MaterialTable } from "@/components/catalog/MaterialRows";
import {
  Button,
  ButtonGroup,
  ButtonGroupItem,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  DataQualityLegend,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Section,
  Select,
} from "@/components/ui";

const t = ptBR.catalog;

/** Debounce a rapidly-changing value (used for the search box). */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

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
  const [view, setView] = useState<"table" | "cards">("table");
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
          <p className="max-w-prose text-sm text-ink-muted">{t.subtitle}</p>
        </div>
        <ButtonLink href="/materiais/novo" variant="primary" size="sm">
          + {ptBR.actions.new}
        </ButtonLink>
      </div>

      <Card>
        <CardHeader
          headingLevel={2}
          title={t.filters}
          actions={
            <ButtonGroup label={t.view}>
              <ButtonGroupItem selected={view === "table"} onClick={() => setView("table")}>
                {t.viewTable}
              </ButtonGroupItem>
              <ButtonGroupItem selected={view === "cards"} onClick={() => setView("cards")}>
                {t.viewCards}
              </ButtonGroupItem>
            </ButtonGroup>
          }
        />
        <CardBody className="flex flex-wrap items-end gap-4">
          <Field label={t.searchLabel} className="min-w-[14rem] flex-1">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
            />
          </Field>

          <Field label={t.filterClass} className="min-w-[10rem]">
            <Select value={classSlug} onChange={(e) => setClassSlug(e.target.value)}>
              <option value="">{t.allClasses}</option>
              {(classes.data ?? []).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.filterQuality} className="min-w-[13rem]">
            <Select
              value={quality}
              onChange={(e) => setQuality(e.target.value as QualityFilter)}
            >
              <option value="any">{t.qualityAny}</option>
              <option value="complete">{t.qualityComplete}</option>
              <option value="gaps">{t.qualityWithGaps}</option>
              <option value="measured">{t.qualityMeasured}</option>
            </Select>
          </Field>

          <Button
            variant="ghost"
            size="sm"
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

      <Section
        id="materiais"
        title={t.count(shown.length)}
        description={shown.length === total ? undefined : t.showing(shown.length, total)}
        actions={<ExportButtons urlFor={catalogueExportUrl} label={ptBR.exports.catalogue} />}
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
                  <ButtonLink href="/materiais/novo" size="sm" variant="primary">
                    + {ptBR.actions.new}
                  </ButtonLink>
                )
              }
            />
          ) : view === "table" ? (
            <MaterialTable materials={shown} />
          ) : (
            <MaterialCards materials={shown} />
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
