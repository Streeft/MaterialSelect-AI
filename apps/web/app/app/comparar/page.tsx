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
  Combobox,
  DensityToggle,
  ErrorState,
  LoadingState,
  PageHeader,
  RemovableChip,
  Section,
  Select,
  SelectOption,
  StepCard,
  Tabs,
  ToggleChip,
  type ComboboxOption,
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

  // The search offers only what is not chosen yet: the chosen ones are the
  // chips below it, each with its own way out (D-86).
  const materialOptions = useMemo<ComboboxOption[]>(
    () =>
      (materials.data ?? [])
        .filter((m) => !selectedMaterials.includes(m.id))
        .map((m) => ({
          value: String(m.id),
          label: m.name,
          description: m.class_name,
          keywords: [m.class_name],
        })),
    [materials.data, selectedMaterials],
  );

  const chosenMaterials = useMemo(() => {
    const byId = new Map((materials.data ?? []).map((m) => [m.id, m.name]));
    return selectedMaterials.map((id) => ({ id, name: byId.get(id) ?? `#${id}` }));
  }, [materials.data, selectedMaterials]);

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

      {/* Three steps, each open once the one before it has something in it; a
          link with `?materiais=` arrives with all three filled (D-86). */}
      <div id="controles" className="grid items-start gap-4 lg:grid-cols-2">
        <StepCard
          title={t.stepMaterials}
          description={t.pickMaterials}
          actions={
            <Badge tone={materialsFull ? "warning" : "neutral"}>
              {t.selectedCount(selectedMaterials.length, MAX_MATERIALS)}
            </Badge>
          }
        >
          {materials.isLoading ? (
            <LoadingState label={ptBR.catalog.loading} />
          ) : (
            <Combobox
              label={t.addMaterial}
              hint={materialsFull ? t.limitReached : t.addMaterialHint}
              options={materialOptions}
              value=""
              onChange={(value) => toggleMaterial(Number(value))}
              clearOnSelect
              disabled={materialsFull}
              noMatchText={() => t.noMaterialsFound}
            />
          )}

          {chosenMaterials.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.noneChosen}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <ul aria-label={t.chosenMaterials} className="flex flex-wrap gap-2">
                {chosenMaterials.map((m) => (
                  <li key={m.id}>
                    <RemovableChip
                      removeLabel={t.removeMaterial}
                      onRemove={() => toggleMaterial(m.id)}
                    >
                      {m.name}
                    </RemovableChip>
                  </li>
                ))}
              </ul>
              <div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedMaterials([])}>
                  {t.clear}
                </Button>
              </div>
            </div>
          )}
        </StepCard>

        <StepCard
          title={t.stepProperties}
          description={t.pickProperties}
          actions={
            <Badge tone={propertiesFull ? "warning" : "neutral"}>
              {t.selectedCount(selectedProperties.length, MAX_PROPERTIES)}
            </Badge>
          }
        >
          {selectedMaterials.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.lockedUntilMaterial}</p>
          ) : (
            <>
              {/* The cap is stated before it bites: a chip that simply stops
                  responding reads as a broken button. */}
              {propertiesFull && <p className="text-support text-ink-subtle">{t.limitReached}</p>}
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
            </>
          )}
        </StepCard>
      </div>

      <Section
        id="visualizacao"
        title={t.stepView}
        actions={
          ready ? (
            <Select
              label={t.normalization}
              value={normalization}
              onChange={(e) => setNormalization(e.target.value as NormalizationMethod)}
            >
              <SelectOption value="minmax">{t.normMinmax}</SelectOption>
              <SelectOption value="vector">{t.normVector}</SelectOption>
            </Select>
          ) : undefined
        }
      >
        {!ready ? (
          <p className="text-sm text-ink-muted">
            {selectedMaterials.length === 0 ? t.lockedUntilMaterial : t.lockedUntilProperty}
          </p>
        ) : (
          /* Real tabs, not a row of buttons: arrows move between the five views
             and only the selected one is in the tab order. Everything the chosen
             view renders is the panel — including the wait and the failure, which
             are also states of that view and not of the page. */
          <Tabs
            label={ptBR.ui.views}
            items={COMPARISON_MODES.map((m) => ({ id: m.key, label: m.label }))}
            value={mode}
            onChange={setMode}
            panelClassName="flex flex-col gap-3 pt-3"
          >
            {mode === "table" && comparison.data ? (
              <div className="flex justify-end">
                <DensityToggle />
              </div>
            ) : null}
            {comparison.isLoading && <LoadingState label={t.loading} />}
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
        )}
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
