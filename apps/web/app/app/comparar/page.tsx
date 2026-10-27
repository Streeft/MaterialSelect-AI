"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getComparison, listMaterials, listPerformanceIndices, listProperties } from "@/lib/api";
import { parseThreshold } from "@/lib/compare-threshold";
import { DEFAULT_NORMALIZATION, compareSearch, readCompareLink } from "@/lib/compare-link";
import { compareLinkText } from "@/lib/i18n-compare-link";
import { ComputedTable } from "@/components/charts/ComputedSection";
import { CopyCompareLink } from "@/components/charts/CopyCompareLink";
import { CustomIndexForm } from "@/components/charts/CustomIndexForm";
import { indexCheckKey, useIndexChecks } from "@/components/charts/useIndexChecks";
import { MAX_COMPUTED, expressionKey } from "@/lib/compare-expression";
import type { ComparisonRequest, NormalizationMethod } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { MAX_COMPARE_MATERIALS, MAX_COMPARE_PROPERTIES } from "@/lib/compareLimits";
import { prettyUnit } from "@/lib/format";
import { optionsAtLevel } from "@/lib/depth";
import { depthSelectorsText } from "@/lib/i18n-depth-selectors";
import { DepthLevelPicker, useDepthLevel } from "@/components/DepthLevelPicker";
import {
  COMPARISON_MODES,
  ComparisonView,
  type ComparisonMode,
} from "@/components/charts/ComparisonView";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Combobox,
  DensityToggle,
  ErrorState,
  LoadingState,
  NumberInput,
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
const MAX_MATERIALS = MAX_COMPARE_MATERIALS;
const MAX_PROPERTIES = MAX_COMPARE_PROPERTIES;

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function ComparePageContent() {
  const params = useSearchParams();
  const queryClient = useQueryClient();
  // D-163: what the link carries besides the materials, read once. The address
  // stays the only copy of it; nothing is kept in the browser.
  const [fromLink] = useState(() => readCompareLink(params));

  const [selectedMaterials, setSelectedMaterials] = useState<number[]>(() =>
    parseIds(params.get("materiais")).slice(0, MAX_MATERIALS),
  );
  // D-174: the property choice is in the link too. `null` is "no choice made":
  // the table then starts from the properties most materials have.
  const [userSelectedProperties, setUserSelectedProperties] = useState<string[] | null>(
    fromLink.properties.slugs,
  );
  // P2: the reference is read from the URL like the material list beside it, so
  // "compared against X" survives a reload and travels in a shared link (B1).
  // A reference held on the server would make the same URL render two different
  // tables for two people.
  const [referenceId, setReferenceId] = useState<number | null>(() => {
    const raw = Number(params.get("referencia"));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });
  // D-128: the highlight threshold is URL state too. An invalid `?limiar=` is
  // discarded (no highlight), never repaired into another number.
  const [threshold, setThreshold] = useState<number | null>(fromLink.threshold);
  const [thresholdText, setThresholdText] = useState<string>(() =>
    fromLink.threshold === null ? "" : String(fromLink.threshold).replace(".", ","),
  );
  const [thresholdInvalid, setThresholdInvalid] = useState(false);
  const [computedSlugs, setComputedSlugs] = useState<string[]>(fromLink.catalogue);
  // D-153: expressions the reader typed. Each one is accepted by the backend's
  // validator before it reaches the request, so a typo cannot take the table
  // away. D-163: the ones that came in the link go through the same validator.
  const [customExpressions, setCustomExpressions] = useState<string[]>(fromLink.expressions);
  const indexChecks = useIndexChecks(customExpressions);
  const acceptedExpressions = indexChecks
    .filter((check) => check.state === "accepted")
    .map((check) => check.expression);
  const refusedChecks = indexChecks.filter((check) => check.state === "refused");
  const refusedKeys = new Set(refusedChecks.map((check) => expressionKey(check.expression)));
  const checkingLink = indexChecks.some((check) => check.state === "checking");
  const [normalization, setNormalization] = useState<NormalizationMethod>(
    fromLink.normalization.value ?? DEFAULT_NORMALIZATION,
  );
  const [mode, setMode] = useState<ComparisonMode>("table");

  const materials = useQuery({ queryKey: ["materials", ""], queryFn: () => listMaterials() });
  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });
  const indices = useQuery({ queryKey: ["performance-indices"], queryFn: listPerformanceIndices });

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

  // D-174: a property the link named that the catalogue no longer has is taken
  // off the request and the address once the catalogue is known, and said.
  const knownProperties = useMemo(
    () => (properties.data ? new Set(properties.data.map((p) => p.slug)) : null),
    [properties.data],
  );
  const chosenProperties = userSelectedProperties ?? defaultProperties;
  const selectedProperties = knownProperties
    ? chosenProperties.filter((slug) => knownProperties.has(slug))
    : chosenProperties;
  const unknownProperties = knownProperties
    ? (fromLink.properties.slugs ?? []).filter((slug) => !knownProperties.has(slug))
    : [];
  // D-165: the level trims the chips on offer, never a property already chosen.
  const depthLevel = useDepthLevel();
  const offeredProperties = optionsAtLevel(properties.data ?? [], depthLevel, selectedProperties);

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

  // Catalogue indices first, then the typed ones; the same expression is never
  // sent twice (the table keys its columns by expression). Only an expression the
  // validator has accepted is sent.
  const chosenCatalogue = (indices.data ?? [])
    .filter((index) => computedSlugs.includes(index.slug))
    .map((index) => ({ name: index.name, expression: index.expression, goal: index.goal }));
  const catalogueKeys = new Set(chosenCatalogue.map((entry) => expressionKey(entry.expression)));
  const computedRequest: NonNullable<ComparisonRequest["computed"]> = [
    ...chosenCatalogue,
    ...acceptedExpressions
      .filter((expression) => !catalogueKeys.has(expressionKey(expression)))
      .map((expression) => ({ expression })),
  ];
  // What the reader has asked for, checked or not yet: the cap and the duplicate
  // test count the ones still with the validator, or two of them could pass.
  const shownExpressions = customExpressions.filter((e) => !refusedKeys.has(expressionKey(e)));
  const takenKeys = new Set([
    ...catalogueKeys,
    ...shownExpressions.map((expression) => expressionKey(expression)),
  ]);
  const requestedTotal = takenKeys.size;

  const request: ComparisonRequest = {
    material_ids: selectedMaterials,
    property_slugs: selectedProperties,
    normalization,
    reference_id: activeReference,
    highlight_threshold_pct: threshold,
    computed: computedRequest,
  };

  // A catalogue index named in the link that the catalogue no longer has: said,
  // not dropped in silence.
  const unknownSlugs = indices.data
    ? fromLink.catalogue.filter((slug) => !indices.data.some((index) => index.slug === slug))
    : [];

  const ready = selectedMaterials.length > 0 && selectedProperties.length > 0;
  const comparison = useQuery({
    queryKey: ["comparison", JSON.stringify(request)],
    queryFn: () => getComparison(request),
    // Held back while a link's typed index is still with the validator (asking
    // for it early would fail the whole table on a typo in a link) and until the
    // catalogue of properties is known (a stale slug in a link would fail it too).
    enabled: ready && !checkingLink && properties.data !== undefined,
  });

  // The address is the link (D-163): every part that has to be shareable is
  // written to it as it changes, so a reload or a pasted link returns the same
  // table. An index still being checked stays in it; a refused one does not.
  const linkState = {
    materials: selectedMaterials,
    reference: activeReference,
    threshold,
    catalogue: computedSlugs,
    expressions: shownExpressions,
    properties: selectedProperties,
    normalization,
  };
  const linkSearch = compareSearch(
    typeof window === "undefined" ? "" : window.location.search,
    linkState,
  );
  useEffect(() => {
    try {
      if (linkSearch === window.location.search) return;
      window.history.replaceState(null, "", `${window.location.pathname}${linkSearch}`);
    } catch {
      // The address is a convenience; the state in the page is what counts.
    }
  }, [linkSearch]);

  function currentLink(): string {
    const url = new URL(window.location.href);
    url.search = compareSearch(url.search, linkState);
    return url.toString();
  }

  function applyThreshold(event: FormEvent) {
    event.preventDefault();
    const parsed = parseThreshold(thresholdText);
    if (parsed === null) {
      // Refused, not repaired: the field says so and the table keeps its
      // previous (valid) highlight.
      setThresholdInvalid(true);
      return;
    }
    setThresholdInvalid(false);
    setThreshold(parsed);
  }

  function clearThreshold() {
    setThresholdText("");
    setThresholdInvalid(false);
    setThreshold(null);
  }

  function toggleComputed(slug: string) {
    setComputedSlugs((current) =>
      current.includes(slug) ? current.filter((x) => x !== slug) : [...current, slug],
    );
  }

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
    setUserSelectedProperties(
      selectedProperties.includes(slug)
        ? selectedProperties.filter((x) => x !== slug)
        : selectedProperties.length >= MAX_PROPERTIES
          ? selectedProperties
          : [...selectedProperties, slug],
    );
  }

  // D-174: what the link carried about the properties and the normalization
  // that could not be used, in words; none of it is in the request or the address.
  const ignoredByLink = [
    ...fromLink.properties.malformed.map((raw) => compareLinkText.badProperty(raw)),
    ...(fromLink.properties.overCap > 0
      ? [compareLinkText.tooManyProperties(fromLink.properties.overCap, MAX_PROPERTIES)]
      : []),
    ...unknownProperties.map((slug) => compareLinkText.unknownProperty(slug)),
    ...(fromLink.normalization.invalid !== null
      ? [
          compareLinkText.badNormalization(
            fromLink.normalization.invalid,
            DEFAULT_NORMALIZATION === "minmax" ? t.normMinmax : t.normVector,
          ),
        ]
      : []),
  ];

  const materialsFull = selectedMaterials.length >= MAX_MATERIALS;
  const propertiesFull = selectedProperties.length >= MAX_PROPERTIES;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        group="estudar"
        actions={selectedMaterials.length > 0 ? <CopyCompareLink getUrl={currentLink} /> : undefined}
      />

      {ignoredByLink.length > 0 && (
        <Alert tone="warning" role="status" title={compareLinkText.ignoredTitle}>
          <ul className="flex flex-col gap-1">
            {ignoredByLink.map((text, i) => (
              <li key={`${i}:${text}`}>{text}</li>
            ))}
          </ul>
        </Alert>
      )}

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
              {(properties.data ?? []).length > 0 && (
                <DepthLevelPicker
                  summary={depthSelectorsText.count(
                    depthLevel,
                    offeredProperties.length,
                    (properties.data ?? []).length,
                    depthSelectorsText.whereCompare,
                  )}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {offeredProperties.map((p) => {
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
          <div className="flex flex-col gap-3">
          <form
            onSubmit={applyThreshold}
            className="well flex flex-wrap items-start gap-3"
          >
            <NumberInput
              label={t.threshold.label}
              hint={t.threshold.hint}
              error={thresholdInvalid ? t.threshold.invalid : undefined}
              value={thresholdText}
              inputMode="decimal"
              step="any"
              min={0}
              onChange={(e) => setThresholdText(e.target.value)}
              className="w-56"
            />
            <div className="flex items-center gap-2 pt-6">
              <Button type="submit" size="sm" variant="secondary">
                {t.threshold.apply}
              </Button>
              {threshold !== null && (
                <Button size="sm" variant="ghost" onClick={clearThreshold}>
                  {t.threshold.clear}
                </Button>
              )}
            </div>
          </form>
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
            {mode === "table" && comparison.data ? (
              <div className="flex justify-end">
                <DensityToggle />
              </div>
            ) : null}
            {checkingLink && <LoadingState label={compareLinkText.checking} />}
            {properties.isLoading && <LoadingState label={t.loading} />}
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
          </div>
        )}
      </Section>

      {ready && (
        <Section id="computadas" title={t.computed.title} headingLevel={2}>
          <div className="flex flex-col gap-3">
            <p className="text-support text-ink-subtle">{t.computed.description}</p>
            {indices.isLoading && <LoadingState label={t.computed.loading} />}
            {indices.isError && (
              <ErrorState title={t.computed.error} onRetry={() => void indices.refetch()} />
            )}
            {indices.data && indices.data.length === 0 && (
              <p className="text-sm text-ink-muted">{t.computed.noneAvailable}</p>
            )}
            {indices.data && indices.data.length > 0 && (
              <div role="group" aria-label={t.computed.pick} className="flex flex-wrap gap-2">
                {indices.data.map((index) => (
                  <ToggleChip
                    key={index.slug}
                    selected={computedSlugs.includes(index.slug)}
                    disabled={
                      !computedSlugs.includes(index.slug) && requestedTotal >= MAX_COMPUTED
                    }
                    onClick={() => toggleComputed(index.slug)}
                    title={index.expression}
                  >
                    {index.name}
                  </ToggleChip>
                ))}
              </div>
            )}
            {(refusedChecks.length > 0 || unknownSlugs.length > 0) && (
              <Alert tone="warning" role="status" title={compareLinkText.refusedTitle}>
                <ul className="flex flex-col gap-1">
                  {refusedChecks.map((check) => (
                    <li key={check.expression}>
                      {compareLinkText.refused(check.expression, check.message ?? "")}
                    </li>
                  ))}
                  {unknownSlugs.map((slug) => (
                    <li key={slug}>{compareLinkText.unknownCatalogue(slug)}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <CustomIndexForm
              expressions={shownExpressions}
              takenKeys={takenKeys}
              total={requestedTotal}
              slugs={properties.data?.map((p) => p.slug)}
              slugsLoading={properties.isLoading}
              onAdd={(expression) => {
                // The server has just accepted it: seed the verdict so the page
                // does not ask the same question again.
                queryClient.setQueryData(indexCheckKey(expression), true);
                setCustomExpressions((current) =>
                  current.some((x) => expressionKey(x) === expressionKey(expression))
                    ? current
                    : [...current, expression],
                );
              }}
              onRemove={(expression) =>
                setCustomExpressions((current) => current.filter((x) => x !== expression))
              }
            />
            {computedRequest.length === 0 ? (
              <p className="text-sm text-ink-muted">{t.computed.none}</p>
            ) : (
              <>
                {comparison.isLoading && <LoadingState label={t.computed.loading} />}
                {comparison.isError && <ErrorState title={t.computed.error} />}
                {comparison.data && <ComputedTable comparison={comparison.data} />}
              </>
            )}
          </div>
        </Section>
      )}

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
