"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  getPropertyMap,
  listClasses,
  listPerformanceIndices,
  listProperties,
} from "@/lib/api";
import type {
  ChartScale,
  Goal,
  IndexIn,
  PerformanceIndex,
  PropertyDefinition,
  PropertyMapRequest,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { AshbyMap } from "@/components/charts/AshbyMap";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ErrorState,
  Input,
  LoadingState,
  Section,
  Select,
  SelectOption,
  ToggleChip,
} from "@/components/ui";
import {
  IndexCard,
  IndexPicker,
  describeCustomIndex,
  describeIndex,
  type IndexDescriptor,
} from "@/components/selection/IndexCard";

const t = ptBR.map;

/** Comma-separated numeric ids from a query string, ignoring junk. */
function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * What one axis is drawing: a catalogued property, or a computed index — the
 * same "predefined slug or custom expression" choice the index overlay already
 * offers, just per axis instead of once for the whole map.
 */
interface AxisState {
  mode: "property" | "index";
  property: string;
  /** "" (nothing chosen yet), a `PerformanceIndex` slug, or "custom". */
  indexSlug: string;
  customExpression: string;
  goal: Goal;
}

/** The axis's index, resolved to a request-ready `IndexIn` — or null while incomplete. */
function resolveAxisIndex(axis: AxisState, indices: PerformanceIndex[]): IndexIn | null {
  if (axis.mode !== "index") return null;
  if (axis.indexSlug === "custom") {
    const expression = axis.customExpression.trim();
    return expression ? { name: t.indexCustom, expression, goal: axis.goal } : null;
  }
  const chosen = indices.find((i) => i.slug === axis.indexSlug);
  return chosen ? { name: chosen.name, expression: chosen.expression, goal: chosen.goal } : null;
}

/** Same choice as `resolveAxisIndex`, kept whole so the card can explain the index. */
function describeAxisIndex(axis: AxisState, indices: PerformanceIndex[]): IndexDescriptor | null {
  if (axis.mode !== "index") return null;
  if (axis.indexSlug === "custom") {
    const expression = axis.customExpression.trim();
    return expression ? describeCustomIndex(expression, axis.goal) : null;
  }
  const chosen = indices.find((i) => i.slug === axis.indexSlug);
  return chosen ? describeIndex(chosen) : null;
}

/** One axis's controls: property picker, or index picker (predefined/custom). */
function AxisControl({
  label,
  axis,
  onChange,
  properties,
  indices,
  dimension,
}: {
  label: string;
  axis: AxisState;
  onChange: (next: AxisState) => void;
  properties: PropertyDefinition[];
  indices: PerformanceIndex[];
  /** Dimension of the resolved index, once the map has computed it (ADR 0004). */
  dimension?: string | null;
}) {
  const descriptor = describeAxisIndex(axis, indices);

  return (
    <div className="flex min-w-[16rem] flex-1 flex-col gap-2">
      <ButtonGroup label={`${label} — ${t.axisTypeProperty.toLowerCase()}/${t.axisTypeIndex.toLowerCase()}`}>
        <ButtonGroupItem
          selected={axis.mode === "property"}
          label={t.axisTypeProperty}
          onClick={() => onChange({ ...axis, mode: "property" })}
        />
        <ButtonGroupItem
          selected={axis.mode === "index"}
          label={t.axisTypeIndex}
          onClick={() => onChange({ ...axis, mode: "index" })}
        />
      </ButtonGroup>

      {axis.mode === "property" ? (
        <Select
          label={label}
          className="min-w-0"
          value={axis.property}
          onChange={(e) => onChange({ ...axis, property: e.target.value })}
        >
          {properties.map((p) => (
            <SelectOption key={p.slug} value={p.slug}>
              {p.name} [{prettyUnit(p.canonical_unit)}]
            </SelectOption>
          ))}
        </Select>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-2xs text-ink-muted">{t.axisIndexHint}</p>
          <Select
            label={label}
            className="min-w-0"
            value={axis.indexSlug}
            onChange={(e) => onChange({ ...axis, indexSlug: e.target.value })}
          >
            <SelectOption value="">{t.axisIndexChoose}</SelectOption>
            {indices.map((i) => (
              <SelectOption key={i.slug} value={i.slug}>
                {i.name}
              </SelectOption>
            ))}
            <SelectOption value="custom">{t.indexCustom}</SelectOption>
          </Select>

          {axis.indexSlug === "custom" && (
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label={t.expression}
                className="min-w-[12rem] flex-1"
                value={axis.customExpression}
                onChange={(e) => onChange({ ...axis, customExpression: e.target.value })}
                placeholder="modulo_young / densidade"
              />
              <Select
                label={t.goal}
                value={axis.goal}
                onChange={(e) => onChange({ ...axis, goal: e.target.value as Goal })}
              >
                <SelectOption value="maximize">{t.maximize}</SelectOption>
                <SelectOption value="minimize">{t.minimize}</SelectOption>
              </Select>
            </div>
          )}

          {descriptor && <IndexCard index={descriptor} dimension={dimension} className="mt-1" />}
        </div>
      )}
    </div>
  );
}

function MapsPageContent() {
  const params = useSearchParams();

  const [xAxis, setXAxis] = useState<AxisState>({
    mode: "property",
    property: params.get("x") ?? "densidade",
    indexSlug: "",
    customExpression: "",
    goal: "maximize",
  });
  const [yAxis, setYAxis] = useState<AxisState>({
    mode: "property",
    property: params.get("y") ?? "modulo_young",
    indexSlug: "",
    customExpression: "",
    goal: "maximize",
  });
  const [scale, setScale] = useState<ChartScale>("log");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [showEnvelopes, setShowEnvelopes] = useState(true);
  const [showIntervals, setShowIntervals] = useState(true);
  const [showLabels, setShowLabels] = useState(false);

  // Materials carried over from a selection run, so a study can be read on the map.
  const restrictedIds = useMemo(() => parseIds(params.get("materiais")), [params]);
  const highlightIds = useMemo(() => parseIds(params.get("destaque")), [params]);

  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const indices = useQuery({
    queryKey: ["performance-indices"],
    queryFn: listPerformanceIndices,
  });

  // Fall back to the first two properties if the seeded slugs are absent.
  // Runs regardless of axis mode: the property field stays ready the moment
  // the reader switches an axis back from index to property.
  useEffect(() => {
    const available = properties.data;
    if (!available || available.length < 2) return;
    const slugs = available.map((p) => p.slug);
    setXAxis((current) =>
      slugs.includes(current.property) ? current : { ...current, property: slugs[0] as string },
    );
    setYAxis((current) =>
      slugs.includes(current.property)
        ? current
        : { ...current, property: (slugs[1] ?? slugs[0]) as string },
    );
  }, [properties.data]);

  const [indexMode, setIndexMode] = useState("none"); // "none" | slug | "custom"
  const [customExpression, setCustomExpression] = useState("");
  const [indexGoal, setIndexGoal] = useState<Goal>("maximize");

  const xResolvedIndex = useMemo(
    () => resolveAxisIndex(xAxis, indices.data ?? []),
    [xAxis, indices.data],
  );
  const yResolvedIndex = useMemo(
    () => resolveAxisIndex(yAxis, indices.data ?? []),
    [yAxis, indices.data],
  );
  // The overlay line needs two property axes (ChartService.property_map
  // rejects the combination) — so it is unavailable, not merely redundant,
  // the moment either axis becomes an index.
  const anyAxisIsIndex = xAxis.mode === "index" || yAxis.mode === "index";

  const activeIndex = useMemo<IndexIn | null>(() => {
    if (anyAxisIsIndex || indexMode === "none") return null;
    if (indexMode === "custom") {
      return customExpression.trim()
        ? { name: t.indexCustom, expression: customExpression.trim(), goal: indexGoal }
        : null;
    }
    const chosen = indices.data?.find((i) => i.slug === indexMode);
    return chosen
      ? { name: chosen.name, expression: chosen.expression, goal: chosen.goal }
      : null;
  }, [anyAxisIsIndex, indexMode, customExpression, indexGoal, indices.data]);

  // Same choice as `activeIndex`, kept whole so the card can show the
  // conditions under which the index — and its line on this map — is valid.
  const indexDescriptor = useMemo<IndexDescriptor | null>(() => {
    if (anyAxisIsIndex || indexMode === "none") return null;
    if (indexMode === "custom") {
      const expression = customExpression.trim();
      return expression ? describeCustomIndex(expression, indexGoal) : null;
    }
    const chosen = indices.data?.find((i) => i.slug === indexMode);
    return chosen ? describeIndex(chosen) : null;
  }, [anyAxisIsIndex, indexMode, customExpression, indexGoal, indices.data]);

  const [levelMaterialIds, setLevelMaterialIds] = useState<number[]>([]);
  const [numericLevels, setNumericLevels] = useState<number[]>([]);
  const [levelDraft, setLevelDraft] = useState("");

  const request = useMemo<PropertyMapRequest>(
    () => ({
      x: xAxis.mode === "property" ? xAxis.property : null,
      y: yAxis.mode === "property" ? yAxis.property : null,
      x_index: xAxis.mode === "index" ? xResolvedIndex : null,
      y_index: yAxis.mode === "index" ? yResolvedIndex : null,
      scale,
      class_slugs: selectedClasses,
      material_ids: restrictedIds.length > 0 ? restrictedIds : null,
      // Always requested; hiding them is a display choice handled in the
      // component, so ticking the box must not cost a round trip.
      include_envelopes: true,
      index: activeIndex,
      index_level_material_ids: levelMaterialIds,
      index_levels: numericLevels,
    }),
    [
      xAxis,
      yAxis,
      xResolvedIndex,
      yResolvedIndex,
      scale,
      selectedClasses,
      restrictedIds,
      activeIndex,
      levelMaterialIds,
      numericLevels,
    ],
  );

  const xReady = xAxis.mode === "property" ? Boolean(xAxis.property) : xResolvedIndex !== null;
  const yReady = yAxis.mode === "property" ? Boolean(yAxis.property) : yResolvedIndex !== null;
  const sameProperty =
    xAxis.mode === "property" && yAxis.mode === "property" && xAxis.property === yAxis.property;
  const sameExpression =
    xAxis.mode === "index" &&
    yAxis.mode === "index" &&
    xResolvedIndex !== null &&
    yResolvedIndex !== null &&
    xResolvedIndex.expression === yResolvedIndex.expression;
  const axisConflict = sameProperty || sameExpression;

  const map = useQuery({
    queryKey: ["property-map", JSON.stringify(request)],
    queryFn: () => getPropertyMap(request),
    enabled: xReady && yReady && !axisConflict,
  });

  const overlay = map.data?.index ?? null;

  function toggleClass(slug: string) {
    setSelectedClasses((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  }

  /** Add a free M level typed by the user (pt-BR decimal comma accepted). */
  function addNumericLevel() {
    const value = Number(levelDraft.replace(",", "."));
    if (!Number.isFinite(value) || numericLevels.includes(value)) return;
    setNumericLevels([...numericLevels, value]);
    setLevelDraft("");
  }

  function removeLevel(materialId: number | null, value: number) {
    if (materialId === null) {
      setNumericLevels(numericLevels.filter((v) => v !== value));
    } else {
      setLevelMaterialIds(levelMaterialIds.filter((id) => id !== materialId));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t.subtitle}</p>
      </div>

      {/* One panel, four named groups.
          The eleven controls used to sit in three anonymous white boxes, in the
          order they were implemented, so nothing said which of them change the
          question being asked and which only change the drawing. */}
      <Section id="controles" title={t.controls} headingLevel={2}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader title={t.groupAxes} />
            <CardBody className="flex flex-wrap items-start gap-4">
              <AxisControl
                label={t.axisX}
                axis={xAxis}
                onChange={setXAxis}
                properties={properties.data ?? []}
                indices={indices.data ?? []}
                dimension={map.data?.x_axis.is_index ? map.data.x_axis.unit : undefined}
              />

              <AxisControl
                label={t.axisY}
                axis={yAxis}
                onChange={setYAxis}
                properties={properties.data ?? []}
                indices={indices.data ?? []}
                dimension={map.data?.y_axis.is_index ? map.data.y_axis.unit : undefined}
              />

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">{t.scale}</span>
                <ButtonGroup label={t.scale}>
                  {(["linear", "log"] as ChartScale[]).map((option) => (
                    <ButtonGroupItem
                      key={option}
                      selected={scale === option}
                      label={option === "linear" ? t.linear : t.log}
                      onClick={() => setScale(option)}
                    />
                  ))}
                </ButtonGroup>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t.groupDisplay} />
            <CardBody className="flex flex-col gap-2">
              <Checkbox
                label={t.envelopes}
                checked={showEnvelopes}
                onChange={(e) => setShowEnvelopes(e.target.checked)}
              />
              <Checkbox
                label={t.intervals}
                checked={showIntervals}
                onChange={(e) => setShowIntervals(e.target.checked)}
              />
              <Checkbox
                label={t.labels}
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
              />
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title={t.groupClasses} />
            <CardBody className="flex flex-wrap gap-2">
              <ToggleChip
                selected={selectedClasses.length === 0}
                onClick={() => setSelectedClasses([])}
              >
                {t.allClasses}
              </ToggleChip>
              {(classes.data ?? []).map((c) => (
                <ToggleChip
                  key={c.slug}
                  selected={selectedClasses.includes(c.slug)}
                  onClick={() => toggleClass(c.slug)}
                >
                  {c.name}
                </ToggleChip>
              ))}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title={t.groupIndex} description={t.indexHint} />
            <CardBody className="flex flex-col gap-3">
              {anyAxisIsIndex ? (
                <Alert tone="info">{t.indexAxisConflict}</Alert>
              ) : (
                <>
                  <IndexPicker
                    indices={indices.data ?? []}
                    value={indexMode}
                    onChange={setIndexMode}
                    customSlot={
                      <div className="flex flex-wrap items-end gap-3">
                        <Input
                          label={t.expression}
                          className="min-w-[16rem] flex-1"
                          value={customExpression}
                          onChange={(e) => setCustomExpression(e.target.value)}
                          placeholder="modulo_young / densidade"
                        />
                        <Select
                          label={t.goal}
                          value={indexGoal}
                          onChange={(e) => setIndexGoal(e.target.value as Goal)}
                        >
                          <SelectOption value="maximize">{t.maximize}</SelectOption>
                          <SelectOption value="minimize">{t.minimize}</SelectOption>
                        </Select>
                      </div>
                    }
                  />

                  {/* The slope shown here is the one the backend computed for these
                      two axes — the card never derives it (ADR 0004). */}
                  {indexDescriptor && (
                    <IndexCard
                      index={indexDescriptor}
                      dimension={overlay?.dimension}
                      indexLine={
                        overlay
                          ? {
                              available: overlay.available,
                              orientation: overlay.orientation,
                              slope: overlay.slope,
                              unavailableReason: overlay.unavailable_reason,
                            }
                          : null
                      }
                    />
                  )}

                  {activeIndex && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-end gap-3">
                        <Select
                          label={t.levelThrough}
                          hint={t.levelsHint}
                          className="min-w-[14rem]"
                          value=""
                          onChange={(e) => {
                            const id = Number(e.target.value);
                            if (Number.isInteger(id) && !levelMaterialIds.includes(id)) {
                              setLevelMaterialIds([...levelMaterialIds, id]);
                            }
                          }}
                        >
                          <SelectOption value="">{t.levelNone}</SelectOption>
                          {(map.data?.points ?? [])
                            .filter(
                              (p) =>
                                p.index_value !== null &&
                                !levelMaterialIds.includes(p.material_id),
                            )
                            .map((p) => (
                              <SelectOption key={p.material_id} value={String(p.material_id)}>
                                {p.material_name}
                              </SelectOption>
                            ))}
                        </Select>

                        {/* Text with a decimal keypad, not `type="number"`: a
                            pt-BR reader types "2,7" and a number input drops what
                            it cannot parse, without saying so. */}
                        <Input
                          label={t.levelValue}
                          className="w-40"
                          value={levelDraft}
                          inputMode="decimal"
                          onChange={(e) => setLevelDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addNumericLevel();
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={addNumericLevel}
                          disabled={!Number.isFinite(Number(levelDraft.replace(",", ".")))}
                        >
                          {t.levelAdd}
                        </Button>
                      </div>

                      {overlay && overlay.levels.length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {overlay.levels.map((level) => (
                            <li
                              key={`${level.value}-${level.material_id ?? "n"}`}
                              className="flex flex-wrap items-center gap-2 text-xs text-ink-muted"
                            >
                              <span>
                                M = {formatNumber(level.value)}
                                {level.material_name ? ` (${level.material_name})` : ""} —{" "}
                                {t.superior(level.superior_material_ids.length)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeLevel(level.material_id, level.value)}
                                aria-label={`${ptBR.actions.remove}: M = ${formatNumber(level.value)}`}
                              >
                                {ptBR.actions.remove}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </Section>

      {axisConflict && (
        <Alert tone="warning" role="alert">
          {sameExpression ? t.sameExpressionAxis : t.sameAxis}
        </Alert>
      )}
      {map.isLoading && !axisConflict && <LoadingState label={t.loading} />}
      {map.isError && (
        <ErrorState
          title={t.error}
          description={map.error instanceof Error ? map.error.message : undefined}
          onRetry={() => void map.refetch()}
        />
      )}

      {map.data && (
        <>
          <AshbyMap
            map={map.data}
            highlightIds={highlightIds}
            showEnvelopes={showEnvelopes}
            showIntervals={showIntervals}
            showLabels={showLabels}
          />

          {map.data.notes.length > 0 && (
            <Section id="observacoes" title={t.notesTitle} headingLevel={2}>
              <Card>
                <CardBody>
                  <ul className="flex flex-col gap-1 text-xs text-ink-muted">
                    {map.data.notes.map((note, i) => (
                      <li key={i}>• {note}</li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </Section>
          )}

          {/* Information, not failure: a material outside the map is a fact
              about the catalogue, and the reader needs the reason to fix it. */}
          {map.data.excluded.length > 0 && (
            <Section id="excluidos" title={t.excludedTitle} description={t.excludedHint}>
              <Card>
                <CardBody>
                  <ul className="flex flex-col gap-1 text-sm text-ink">
                    {map.data.excluded.map((e) => (
                      <li key={e.material_id}>
                        <span className="font-medium">{e.name}</span>{" "}
                        <span className="text-ink-muted">— {e.reason}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </Section>
          )}

          {map.data.points.length > 0 && (
            <div>
              <ButtonLink
                href={`/comparar?materiais=${map.data.points.map((p) => p.material_id).join(",")}`}
                size="sm"
              >
                {t.compareSelected} →
              </ButtonLink>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MapsPage() {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense fallback={<LoadingState label={t.loading} />}>
      <MapsPageContent />
    </Suspense>
  );
}
