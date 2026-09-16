"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getComparison, listMaterials, listProperties } from "@/lib/api";
import type { ComparisonRequest, NormalizationMethod } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { prettyUnit } from "@/lib/format";
import {
  COMPARISON_MODES,
  ComparisonView,
  type ComparisonMode,
} from "@/components/charts/ComparisonView";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Select,
  SelectOption,
  Tabs,
  ToggleChip,
} from "@/components/ui";

const t = ptBR.compare;

// Mirrors MAX_COMPARE_* in apps/api/app/schemas/charts.py; the server rejects
// anything larger, and the UI should not let the user get that far.
const MAX_MATERIALS = 12;
const MAX_PROPERTIES = 12;

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function ComparePageContent() {
  const params = useSearchParams();

  const [selectedMaterials, setSelectedMaterials] = useState<number[]>(() =>
    parseIds(params.get("materiais")).slice(0, MAX_MATERIALS),
  );
  const [userSelectedProperties, setUserSelectedProperties] = useState<string[] | null>(null);
  // P2: the reference is read from the URL like the material list beside it, so
  // "compared against X" survives a reload and travels in a shared link (B1).
  // A reference held on the server would make the same URL render two different
  // tables for two people.
  const [referenceId, setReferenceId] = useState<number | null>(() => {
    const raw = Number(params.get("referencia"));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });
  const [normalization, setNormalization] = useState<NormalizationMethod>("minmax");
  const [mode, setMode] = useState<ComparisonMode>("table");
  const [search, setSearch] = useState("");

  const materials = useQuery({ queryKey: ["materials", ""], queryFn: () => listMaterials() });
  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });

  // Sensible first view: the properties most materials actually have.
  // Derived during render rather than scheduled in an effect to avoid
  // cascading renders and satisfy react-hooks/set-state-in-effect.
  const defaultProperties = useMemo(() => {
    if (!properties.data) return [];
    return [...properties.data]
      .filter((p) => p.value_count > 0)
      .sort((a, b) => b.value_count - a.value_count)
      .slice(0, 4)
      .map((p) => p.slug);
  }, [properties.data]);

  const selectedProperties = userSelectedProperties ?? defaultProperties;

  const visibleMaterials = useMemo(() => {
    const all = materials.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (m) =>
        m.name.toLowerCase().includes(term) || m.class_name.toLowerCase().includes(term),
    );
  }, [materials.data, search]);

  // A reference that is no longer among the compared materials is dropped
  // rather than sent: the API refuses it, and the reader removing a row should
  // not be handed an error for it.
  const activeReference =
    referenceId !== null && selectedMaterials.includes(referenceId) ? referenceId : null;

  const request = useMemo<ComparisonRequest>(
    () => ({
      material_ids: selectedMaterials,
      property_slugs: selectedProperties,
      normalization,
      reference_id: activeReference,
    }),
    [selectedMaterials, selectedProperties, normalization, activeReference],
  );

  const ready = selectedMaterials.length > 0 && selectedProperties.length > 0;
  const comparison = useQuery({
    queryKey: ["comparison", JSON.stringify(request)],
    queryFn: () => getComparison(request),
    enabled: ready,
  });

  function toggleMaterial(id: number) {
    setSelectedMaterials((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length >= MAX_MATERIALS
          ? current
          : [...current, id],
    );
  }

  function toggleProperty(slug: string) {
    setUserSelectedProperties((current) => {
      const base = current ?? defaultProperties;
      return base.includes(slug)
        ? base.filter((x) => x !== slug)
        : base.length >= MAX_PROPERTIES
          ? base
          : [...base, slug];
    });
  }

  const materialsFull = selectedMaterials.length >= MAX_MATERIALS;
  const propertiesFull = selectedProperties.length >= MAX_PROPERTIES;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} group="estudar" />

      <Section id="controles" title={t.controls} headingLevel={2}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title={t.groupMaterials}
              description={t.pickMaterials}
              actions={
                <Badge tone={materialsFull ? "warning" : "neutral"}>
                  {t.selectedCount(selectedMaterials.length, MAX_MATERIALS)}
                </Badge>
              }
            />
            <CardBody className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  label={t.search}
                  className="min-w-[12rem] flex-1"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.search}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedMaterials([])}
                  disabled={selectedMaterials.length === 0}
                >
                  {t.clear}
                </Button>
              </div>

              {materials.isLoading && <LoadingState label={ptBR.catalog.loading} />}
              {/* The cap is stated before it bites: a chip that simply stops
                  responding reads as a broken button. */}
              {materialsFull && <p className="text-2xs text-ink-subtle">{t.limitReached}</p>}
              {!materials.isLoading && visibleMaterials.length === 0 && (
                <p className="text-sm text-ink-muted">{t.noMaterialsFound}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {visibleMaterials.map((m) => {
                  const chosen = selectedMaterials.includes(m.id);
                  return (
                    <ToggleChip
                      key={m.id}
                      selected={chosen}
                      disabled={!chosen && materialsFull}
                      onClick={() => toggleMaterial(m.id)}
                    >
                      {m.name}
                    </ToggleChip>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t.groupProperties}
              description={t.pickProperties}
              actions={
                <Badge tone={propertiesFull ? "warning" : "neutral"}>
                  {t.selectedCount(selectedProperties.length, MAX_PROPERTIES)}
                </Badge>
              }
            />
            <CardBody className="flex flex-col gap-3">
              {propertiesFull && <p className="text-2xs text-ink-subtle">{t.limitReached}</p>}
              <div className="flex flex-wrap gap-2">
                {(properties.data ?? []).map((p) => {
                  const chosen = selectedProperties.includes(p.slug);
                  return (
                    <ToggleChip
                      key={p.slug}
                      selected={chosen}
                      disabled={!chosen && propertiesFull}
                      onClick={() => toggleProperty(p.slug)}
                      title={`${ptBR.direction[p.better_direction]} · ${prettyUnit(p.canonical_unit)}`}
                    >
                      {p.name}
                    </ToggleChip>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section
        id="visualizacao"
        title={t.groupView}
        actions={
          <Select
            label={t.normalization}
            value={normalization}
            onChange={(e) => setNormalization(e.target.value as NormalizationMethod)}
          >
            <SelectOption value="minmax">{t.normMinmax}</SelectOption>
            <SelectOption value="vector">{t.normVector}</SelectOption>
          </Select>
        }
      >
        {/* Real tabs, not a row of buttons: arrows move between the five views
            and only the selected one is in the tab order. Everything the chosen
            view renders is the panel — including the wait and the failure, which
            are also states of that view and not of the page. */}
        <Tabs
          label={ptBR.ui.views}
          items={COMPARISON_MODES.map((m) => ({ id: m.key, label: m.label }))}
          value={mode}
          onChange={setMode}
          panelClassName="flex flex-col gap-3 pt-3"
        >
          {!ready && <EmptyState title={t.empty} />}
          {comparison.isLoading && ready && <LoadingState label={t.loading} />}
          {comparison.isError && (
            <ErrorState
              title={t.error}
              description={
                comparison.error instanceof Error ? comparison.error.message : undefined
              }
              onRetry={() => void comparison.refetch()}
            />
          )}

          {comparison.data && (
            <ComparisonView
              comparison={comparison.data}
              mode={mode}
              referenceId={activeReference}
              onSetReference={setReferenceId}
            />
          )}
        </Tabs>
      </Section>

      {comparison.data && comparison.data.notes.length > 0 && (
        <Section id="observacoes" title={t.notesTitle} headingLevel={2}>
          <Card>
            <CardBody>
              <ul className="flex flex-col gap-1 text-xs text-ink-muted">
                {Array.from(new Set(comparison.data.notes)).map((note, i) => (
                  <li key={i}>• {note}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </Section>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<LoadingState label={t.loading} />}>
      <ComparePageContent />
    </Suspense>
  );
}
