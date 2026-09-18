"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSavedChart,
  deleteSavedChart,
  getPropertyMap,
  getSavedChart,
  listClasses,
  listPerformanceIndices,
  listProperties,
  listSavedCharts,
} from "@/lib/api";
import type {
  ChartScale,
  Goal,
  IndexIn,
  PerformanceIndex,
  PropertyDefinition,
  PropertyMapRequest,
  SavedChartIn,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { AshbyMap, type BoxSelection } from "@/components/charts/AshbyMap";
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
  Dialog,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
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
import { applyMapState, decodeMapState, encodeMapState, type MapUrlState } from "./url-state";

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
export interface AxisState {
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
  const router = useRouter();

  // Decode URL state once on mount; read it only once, since the URL should not
  // keep re-driving state after the user starts interacting.
  const decodedState = useMemo(() => {
    const estado = params.get("estado");
    return estado ? decodeMapState(estado) : null;
  }, [params]);

  const [xAxis, setXAxis] = useState<AxisState>({
    mode: decodedState?.xAxis?.mode ?? "property",
    property: decodedState?.xAxis?.property ?? params.get("x") ?? "densidade",
    indexSlug: decodedState?.xAxis?.indexSlug ?? "",
    customExpression: decodedState?.xAxis?.customExpression ?? "",
    goal: decodedState?.xAxis?.goal ?? "maximize",
  });
  const [yAxis, setYAxis] = useState<AxisState>({
    mode: decodedState?.yAxis?.mode ?? "property",
    property: decodedState?.yAxis?.property ?? params.get("y") ?? "modulo_young",
    indexSlug: decodedState?.yAxis?.indexSlug ?? "",
    customExpression: decodedState?.yAxis?.customExpression ?? "",
    goal: decodedState?.yAxis?.goal ?? "maximize",
  });
  const [scale, setScale] = useState<ChartScale>(decodedState?.scale ?? "log");
  const [displayScale, setDisplayScale] = useState<ChartScale>(scale);
  // The cloud is the default because it is what an Ashby chart is read by;
  // the hull stays one click away for "exactly which region do these occupy".
  const [envelopeShape, setEnvelopeShape] = useState<"hull" | "ellipse">(decodedState?.envelopeShape ?? "ellipse");
  const [selectedClasses, setSelectedClasses] = useState<string[]>(decodedState?.selectedClasses ?? []);
  const [showEnvelopes, setShowEnvelopes] = useState(decodedState?.showEnvelopes ?? true);
  const [showIntervals, setShowIntervals] = useState(decodedState?.showIntervals ?? true);
  const [showLabels, setShowLabels] = useState(decodedState?.showLabels ?? false);

  // Selection box state for interactive region dragging (P1-2)
  const [selectedBox, setSelectedBox] = useState<BoxSelection | null>(null);

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
  // Adjusting state during render avoids cascading effects and satisfies
  // react-hooks/set-state-in-effect.
  const availableProperties = properties.data;
  if (availableProperties && availableProperties.length >= 2) {
    const slugs = availableProperties.map((p) => p.slug);
    if (!slugs.includes(xAxis.property)) {
      setXAxis((current) => ({ ...current, property: slugs[0] as string }));
    }
    if (!slugs.includes(yAxis.property)) {
      setYAxis((current) => ({
        ...current,
        property: (slugs[1] ?? slugs[0]) as string,
      }));
    }
  }

  const [indexMode, setIndexMode] = useState(decodedState?.indexMode ?? "none"); // "none" | slug | "custom"
  const [customExpression, setCustomExpression] = useState(decodedState?.customExpression ?? "");
  const [indexGoal, setIndexGoal] = useState<Goal>(decodedState?.indexGoal ?? "maximize");

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

  const [levelMaterialIds, setLevelMaterialIds] = useState<number[]>(decodedState?.levelMaterialIds ?? []);
  const [numericLevels, setNumericLevels] = useState<number[]>(decodedState?.numericLevels ?? []);
  const [levelDraft, setLevelDraft] = useState("");

  const request = useMemo<PropertyMapRequest>(
    () => ({
      x: xAxis.mode === "property" ? xAxis.property : null,
      y: yAxis.mode === "property" ? yAxis.property : null,
      x_index: xAxis.mode === "index" ? xResolvedIndex : null,
      y_index: yAxis.mode === "index" ? yResolvedIndex : null,
      scale,
      envelope_shape: envelopeShape,
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
      envelopeShape,
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
    // Keep the previous map on screen while the next one is in flight, so a
    // scale toggle (or any other axis change) does not blink the whole chart
    // between every interaction.
    placeholderData: (previous) => previous,
  });

  const overlay = map.data?.index ?? null;

  const pointsInBox = useMemo(() => {
    if (!selectedBox || !map.data?.points) return [];
    const { xMin, xMax, yMin, yMax } = selectedBox;
    return map.data.points.filter((p) => {
      if (xMin !== null && p.x < xMin) return false;
      if (xMax !== null && p.x > xMax) return false;
      if (yMin !== null && p.y < yMin) return false;
      if (yMax !== null && p.y > yMax) return false;
      return true;
    });
  }, [selectedBox, map.data?.points]);

  function handleXAxisChange(next: AxisState) {
    setSelectedBox(null);
    setXAxis(next);
  }

  function handleYAxisChange(next: AxisState) {
    setSelectedBox(null);
    setYAxis(next);
  }

  function toggleClass(slug: string) {
    setSelectedClasses((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  }

  // Save/load chart configuration state and handlers.
  const queryClient = useQueryClient();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [chartNameDraft, setChartNameDraft] = useState("");
  const savedCharts = useQuery({
    queryKey: ["saved-charts"],
    queryFn: listSavedCharts,
  });

  const createMutation = useMutation({
    mutationFn: (payload: SavedChartIn) => createSavedChart(payload),
    onSuccess: () => {
      setSaveDialogOpen(false);
      setChartNameDraft("");
      queryClient.invalidateQueries({ queryKey: ["saved-charts"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (chartId: number) => deleteSavedChart(chartId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-charts"] });
    },
  });

  /** Get the current map state as a MapUrlState object. */
  function getCurrentMapState(): MapUrlState {
    return {
      xAxis,
      yAxis,
      scale,
      envelopeShape,
      selectedClasses,
      showEnvelopes,
      showIntervals,
      showLabels,
      indexMode,
      customExpression,
      indexGoal,
      levelMaterialIds,
      numericLevels,
    };
  }

  /** Save the current configuration with the user-supplied name. */
  async function handleSaveChart() {
    const name = chartNameDraft.trim();
    if (!name) return;
    const state = getCurrentMapState();
    await createMutation.mutateAsync({
      name,
      configuration: state as unknown as Record<string, unknown>,
    });
  }

  /**
   * Load a saved chart configuration and apply it to the page state.
   *
   * `savedCharts.data` is the list endpoint's `{id, name, created_at}` shape
   * (`SavedChartListItem`), deliberately without `configuration` — so the
   * full record, `configuration` included, has to be fetched by id before
   * there is anything real to apply.
   */
  async function handleLoadChart(chartId: number) {
    const chart = await getSavedChart(chartId);
    const decoded = chart.configuration as Partial<MapUrlState>;
    const defaults = getCurrentMapState();
    const applied = applyMapState(decoded, defaults);

    if (applied.xAxis) setXAxis(applied.xAxis as AxisState);
    if (applied.yAxis) setYAxis(applied.yAxis as AxisState);
    if (applied.scale) {
      // `displayScale` is the axis type the chart actually renders (it wins
      // over `map.scale` while a new request is in flight, see AshbyMap) and
      // is otherwise only kept in sync with `scale` by the scale toggle's
      // onClick — so it has to be set here too, or the chart keeps drawing
      // the old scale until the reader clicks the toggle themselves.
      setScale(applied.scale);
      setDisplayScale(applied.scale);
    }
    if (applied.selectedClasses) setSelectedClasses(applied.selectedClasses);
    if (applied.showEnvelopes !== undefined) setShowEnvelopes(applied.showEnvelopes);
    if (applied.showIntervals !== undefined) setShowIntervals(applied.showIntervals);
    if (applied.showLabels !== undefined) setShowLabels(applied.showLabels);
    if (applied.indexMode) setIndexMode(applied.indexMode);
    if (applied.customExpression !== undefined) setCustomExpression(applied.customExpression);
    if (applied.indexGoal) setIndexGoal(applied.indexGoal);
    if (applied.levelMaterialIds) setLevelMaterialIds(applied.levelMaterialIds);
    if (applied.numericLevels) setNumericLevels(applied.numericLevels);
  }

  /** Build and share the current map state as a URL. */
  async function shareMap() {
    try {
      const state = getCurrentMapState();
      const encoded = encodeMapState(state);
      const url = `${window.location.origin}${window.location.pathname}?estado=${encoded}`;

      // Update URL without adding to history.
      router.replace(`?estado=${encoded}`);

      // Copy to clipboard.
      await navigator.clipboard.writeText(url);

      // Brief visual feedback (reuse the existing pattern if there is one,
      // or show a simple inline message).
    } catch (err) {
      console.error("Failed to share:", err);
    }
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
      <div className="flex flex-col gap-2">
        <PageHeader
          title={t.title}
          description={t.subtitle}
          group="estudar"
          actions={
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSaveDialogOpen(true)}
                title={t.saveTooltip}
              >
                {t.save}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void shareMap()}
                title={t.shareTooltip}
              >
                {t.share}
              </Button>
            </>
          }
        />

        {/* Saved charts picker */}
        {(savedCharts.data?.length ?? 0) > 0 && (
          <div className="flex items-end gap-2">
            <Select
              label={t.savedCharts}
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (Number.isInteger(id) && id > 0) {
                  void handleLoadChart(id);
                }
              }}
              className="min-w-[16rem]"
            >
              <SelectOption value="">{t.savedCharts}</SelectOption>
              {(savedCharts.data ?? []).map((chart) => (
                <SelectOption key={chart.id} value={String(chart.id)}>
                  {chart.name}
                </SelectOption>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Save chart dialog */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => {
          setSaveDialogOpen(false);
          setChartNameDraft("");
        }}
        title={t.save}
        description={t.saveTooltip}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSaveDialogOpen(false);
                setChartNameDraft("");
              }}
            >
              {t.cancel}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSaveChart()}
              disabled={!chartNameDraft.trim() || createMutation.isPending}
            >
              {t.ok}
            </Button>
          </div>
        }
      >
        <Input
          label={t.chartName}
          placeholder={t.chartNamePlaceholder}
          value={chartNameDraft}
          onChange={(e) => setChartNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSaveChart();
            }
          }}
          autoFocus
        />
      </Dialog>

      {/* One panel, four named groups */}
      <Section id="controles" title={t.controls} headingLevel={2}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader title={t.groupAxes} />
            <CardBody className="flex flex-wrap items-start gap-4">
              <AxisControl
                label={t.axisX}
                axis={xAxis}
                onChange={handleXAxisChange}
                properties={properties.data ?? []}
                indices={indices.data ?? []}
                dimension={map.data?.x_axis.is_index ? map.data.x_axis.unit : undefined}
              />

              <AxisControl
                label={t.axisY}
                axis={yAxis}
                onChange={handleYAxisChange}
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
                      selected={displayScale === option}
                      label={option === "linear" ? t.linear : t.log}
                      onClick={() => {
                        setDisplayScale(option);
                        setScale(option);
                      }}
                    />
                  ))}
                </ButtonGroup>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">{t.envelope}</span>
                <ButtonGroup label={t.envelope}>
                  {(["hull", "ellipse"] as const).map((option) => (
                    <ButtonGroupItem
                      key={option}
                      selected={envelopeShape === option}
                      label={option === "hull" ? t.convexHull : t.adjustedEllipse}
                      onClick={() => setEnvelopeShape(option)}
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
                          {overlay.levels.map((level) => (\n                            <li\n                              key={`${level.value}-${level.material_id ?? \"n\"}`}\n                              className=\"flex flex-wrap items-center gap-2 text-xs text-ink-muted\"\n                            >\n                              <span>\n                                M = {formatNumber(level.value)}\n                                {level.material_name ? ` (${level.material_name})` : \"\"} —{\" \"}\n                                {t.superior(level.superior_material_ids.length)}\n                              </span>\n                              <Button\n                                size=\"sm\"\n                                variant=\"ghost\"\n                                onClick={() => removeLevel(level.material_id, level.value)}\n                                aria-label={`${ptBR.actions.remove}: M = ${formatNumber(level.value)}`}\n                              >\n                                {ptBR.actions.remove}\n                              </Button>\n                            </li>\n                          ))}\n                        </ul>\n                      )}\n                    </div>\n                  )}\n                </>\n              )}\n            </CardBody>\n          </Card>\n        </div>\n      </Section>\n\n      {axisConflict && (\n        <Alert tone=\"warning\" role=\"alert\">\n          {sameExpression ? t.sameExpressionAxis : t.sameAxis}\n        </Alert>\n      )}\n      {map.isLoading && !axisConflict && <LoadingState label={t.loading} />}\n      {map.isError && (\n        <ErrorState\n          title={t.error}\n          description={map.error instanceof Error ? map.error.message : undefined}\n          onRetry={() => void map.refetch()}\n        />\n      )}\n\n      {map.data && (\n        <>\n          {selectedBox && (\n            <Card className=\"border-brand-300 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/20\">\n              <CardBody className=\"flex flex-wrap items-center justify-between gap-4 py-3\">\n                <div className=\"flex flex-col gap-1\">\n                  <span className=\"text-xs font-semibold text-brand-700 dark:text-brand-300\">\n                    {t.selectedRegionTitle}\n                  </span>\n                  <span className=\"text-sm text-ink\">\n                    {t.selectedRegionBounds(\n                      `${selectedBox.xMin !== null ? formatNumber(selectedBox.xMin) : \"—\"} a ${selectedBox.xMax !== null ? formatNumber(selectedBox.xMax) : \"—\"} ${prettyUnit(map.data.x_axis.unit)}`,\n                      `${selectedBox.yMin !== null ? formatNumber(selectedBox.yMin) : \"—\"} a ${selectedBox.yMax !== null ? formatNumber(selectedBox.yMax) : \"—\"} ${prettyUnit(map.data.y_axis.unit)}`,\n                    )}\n                  </span>\n                  <span className=\"text-xs text-ink-muted\">\n                    {t.selectedCount(pointsInBox.length)}\n                  </span>\n                </div>\n                <div className=\"flex items-center gap-2\">\n                  <Button\n                    size=\"sm\"\n                    variant=\"ghost\"\n                    onClick={() => setSelectedBox(null)}\n                  >\n                    {t.clearSelection}\n                  </Button>\n                  <Button\n                    size=\"sm\"\n                    variant=\"primary\"\n                    onClick={() => {\n                      const query = new URLSearchParams();\n                      query.set(\"etapa\", \"restricoes\");\n                      query.set(\"novo_estagio\", \"chart\");\n                      if (xAxis.mode === \"property\") {\n                        query.set(\"x_prop\", xAxis.property);\n                      } else if (xAxis.mode === \"index\") {\n                        const res = resolveAxisIndex(xAxis, indices.data ?? []);\n                        if (res) query.set(\"x_expr\", res.expression);\n                      }\n                      if (yAxis.mode === \"property\") {\n                        query.set(\"y_prop\", yAxis.property);\n                      } else if (yAxis.mode === \"index\") {\n                        const res = resolveAxisIndex(yAxis, indices.data ?? []);\n                        if (res) query.set(\"y_expr\", res.expression);\n                      }\n                      if (selectedBox.xMin !== null) query.set(\"x_min\", String(selectedBox.xMin));\n                      if (selectedBox.xMax !== null) query.set(\"x_max\", String(selectedBox.xMax));\n                      if (selectedBox.yMin !== null) query.set(\"y_min\", String(selectedBox.yMin));\n                      if (selectedBox.yMax !== null) query.set(\"y_max\", String(selectedBox.yMax));\n                      router.push(`/app/selecao?${query.toString()}`);\n                    }}\n                  >\n                    {t.useInSelection} →\n                  </Button>\n                </div>\n              </CardBody>\n            </Card>\n          )}\n\n          <AshbyMap\n            map={map.data}\n            displayScale={displayScale}\n            isFetching={map.isFetching}\n            highlightIds={highlightIds}\n            showEnvelopes={showEnvelopes}\n            showIntervals={showIntervals}\n            showLabels={showLabels}\n            enableBoxSelect\n            selectionBox={selectedBox}\n            onSelectBox={setSelectedBox}\n          />\n\n          {map.data.notes.length > 0 && (\n            <Section id=\"observacoes\" title={t.notesTitle} headingLevel={2}>\n              <Card>\n                <CardBody>\n                  <ul className=\"flex flex-col gap-1 text-xs text-ink-muted\">\n                    {map.data.notes.map((note, i) => (\n                      <li key={i}>• {note}</li>\n                    ))}\n                  </ul>\n                </CardBody>\n              </Card>\n            </Section>\n          )}\n\n          {/* Information, not failure: a material outside the map is a fact\n              about the catalogue, and the reader needs the reason to fix it. */}\n          {map.data.excluded.length > 0 && (\n            <Section id=\"excluidos\" title={t.excludedTitle} description={t.excludedHint}>\n              <Card>\n                <CardBody>\n                  <ul className=\"flex flex-col gap-1 text-sm text-ink\">\n                    {map.data.excluded.map((e) => (\n                      <li key={e.material_id}>\n                        <span className=\"font-medium\">{e.name}</span>{\" \"}\n                        <span className=\"text-ink-muted\">— {e.reason}</span>\n                      </li>\n                    ))}\n                  </ul>\n                </CardBody>\n              </Card>\n            </Section>\n          )}\n\n          {map.data.points.length > 0 && (\n            <div>\n              <ButtonLink\n                href={`/app/comparar?materiais=${map.data.points.map((p) => p.material_id).join(\",\")}`}\n                size=\"sm\"\n              >\n                {t.compareSelected} →\n              </ButtonLink>\n            </div>\n          )}\n        </>\n      )}\n    </div>\n  );\n}\n\nexport default function MapsPage() {\n  // useSearchParams needs a Suspense boundary during prerendering.\n  return (\n    <Suspense fallback={<LoadingState label={t.loading} />}>\n      <MapsPageContent />\n    </Suspense>\n  );\n}\n