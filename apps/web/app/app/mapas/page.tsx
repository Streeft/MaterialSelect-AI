"use client";

import { describeApiError } from "@/lib/errors";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  convertMapBox,
  createSavedChart,
  getPropertyMap,
  getSavedChart,
  listClasses,
  listMapPresets,
  listPerformanceIndices,
  listProcessAttributes,
  listProcessClasses,
  listProperties,
  listSavedCharts,
  moveIndexLine,
} from "@/lib/api";
import type {
  ChartScale,
  Goal,
  IndexIn,
  IndexLineRequest,
  MapPreset,
  PropertyMapRequest,
  SavedChartIn,
  SelectionUniverse,
  SuggestAction,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { toMapBox } from "@/lib/mapBox";
import { optionsAtLevel } from "@/lib/depth";
import { encodeIdList, parseIdList } from "@/lib/idList";
import { formatNumber } from "@/lib/format";
import { useUrlState } from "@/lib/urlState";
import { recordMapUrl } from "@/lib/navMemory";
import { useDebounced } from "@/lib/useDebounced";
import { useWindowClass } from "@/lib/useWindowClass";
import { atLeast } from "@/lib/design/breakpoints";
import { useDepthLevel } from "@/components/DepthLevelPicker";
import { AISuggestPanel } from "@/components/ai/AISuggestPanel";
import { AshbyMap, type BoxSelection } from "@/components/charts/AshbyMap";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  Dialog,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/ui";
import { useAnnounce } from "@/components/ui/Announcer";
import {
  describeCustomIndex,
  describeIndex,
  type IndexDescriptor,
} from "@/components/selection/IndexCard";
import {
  applyMapState,
  customizationsInUse,
  decodeMapState,
  mapUsesCustomization,
  type AxisState,
  type MapUrlState,
} from "./url-state";
import { MAP_LIVE_URL, isDefaultMapState } from "./mapUrl";
import { resolveAxisIndex } from "./axisIndex";
import { AxesPanel } from "./AxesPanel";
import { InspectorSection } from "./Inspector";
import { MapViews } from "./MapViews";
import { CustomizePanel } from "./CustomizePanel";
import { IndexLineControl } from "./IndexLineControl";
import { SelectionPanel } from "./SelectionPanel";
import { PointList } from "./PointList";
import { activePresetSlug } from "./MapPresets";

const t = ptBR.map;

/** Same ids, same array: a URL change elsewhere must not redraw the map (D-190). */
function useStableIds(ids: number[]): number[] {
  const key = ids.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ids, [key]);
}

const EMPTY_AXIS: AxisState = {
  mode: "property",
  property: "",
  indexSlug: "",
  customExpression: "",
  goal: "maximize",
};

/**
 * `/app/mapas` (D-91, D-213): the map is the screen. This component holds the
 * question and orchestrates; the pieces are `AxesPanel` (universe, axes,
 * classic charts), `CustomizePanel` (drawing), `SelectionPanel` (what is
 * selected and where it goes), `AshbyMap` (the figure) and `PointList` (the
 * figure's points for the keyboard). Everything a reader sets lives in the
 * address (`mapUrl.ts`), so a reload or a pasted link opens the same map.
 */
function MapsPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const [live, setLive] = useUrlState(MAP_LIVE_URL);
  const wide = atLeast(useWindowClass(), "expanded");

  // D-232: the home's "Último mapa" reopens the map as it was left — the whole
  // address, not just the path. `live` and `params` change with every write to it.
  useEffect(() => {
    recordMapUrl(`${window.location.pathname}${window.location.search}`);
  }, [live, params]);

  // Decode URL state once on mount; the URL should not keep re-driving state
  // after the reader starts interacting (it follows the state instead).
  const [decodedState] = useState(() => {
    const estado = params.get("estado");
    return estado ? decodeMapState(estado) : null;
  });

  const [universe, setUniverse] = useState<SelectionUniverse>(() => {
    if (decodedState?.universe) return decodedState.universe;
    return params.get("universo") === "process" ? "process" : "material";
  });

  // On a narrow window "Personalizar o mapa" stays a disclosure, collapsed
  // unless the link already customises something (D-85, D-86); on a wide one
  // it is always open beside the map (D-213).
  const [customizeOpen, setCustomizeOpen] = useState(() =>
    mapUsesCustomization({ ...decodedState, universe }),
  );
  // D-221: the inspector's folds. Selection and axes start open; the three
  // drawing sections follow D-213 — open beside the map on a wide window, and
  // on a narrow one open by themselves only when the link uses one of them.
  const [openSections, setOpenSections] = useState<Partial<Record<InspectorPart, boolean>>>({});
  const sectionOpen = (part: InspectorPart): boolean =>
    openSections[part] ??
    (part === "selection" || part === "axes" ? true : wide || customizeOpen);
  const setSection = (part: InspectorPart, next: boolean) => {
    setOpenSections((current) => ({ ...current, [part]: next }));
    if (part !== "selection" && part !== "axes" && next) setCustomizeOpen(true);
  };
  const customizeVisible = wide || customizeOpen;
  // D-221: below lg the inspector is a bottom sheet; it starts folded to its head.
  const [sheetOpen, setSheetOpen] = useState(false);

  const [xAxis, setXAxis] = useState<AxisState>(() => ({
    mode: decodedState?.xAxis?.mode ?? "property",
    property:
      decodedState?.xAxis?.property ??
      params.get("x") ??
      (universe === "process" ? "" : "densidade"),
    indexSlug: decodedState?.xAxis?.indexSlug ?? "",
    customExpression: decodedState?.xAxis?.customExpression ?? "",
    goal: decodedState?.xAxis?.goal ?? "maximize",
  }));
  const [yAxis, setYAxis] = useState<AxisState>(() => ({
    mode: decodedState?.yAxis?.mode ?? "property",
    property:
      decodedState?.yAxis?.property ??
      params.get("y") ??
      (universe === "process" ? "" : "modulo_young"),
    indexSlug: decodedState?.yAxis?.indexSlug ?? "",
    customExpression: decodedState?.yAxis?.customExpression ?? "",
    goal: decodedState?.yAxis?.goal ?? "maximize",
  }));
  const [scale, setScale] = useState<ChartScale>(decodedState?.scale ?? "log");
  const [displayScale, setDisplayScale] = useState<ChartScale>(scale);
  // The cloud is the default because it is what an Ashby chart is read by;
  // the hull stays one click away for "exactly which region do these occupy".
  const [envelopeShape, setEnvelopeShape] = useState<"hull" | "ellipse">(
    decodedState?.envelopeShape ?? "ellipse",
  );
  const [selectedClasses, setSelectedClasses] = useState<string[]>(
    decodedState?.selectedClasses ?? [],
  );
  const [showEnvelopes, setShowEnvelopes] = useState(decodedState?.showEnvelopes ?? true);
  const [showIntervals, setShowIntervals] = useState(decodedState?.showIntervals ?? true);
  const [showLabels, setShowLabels] = useState(decodedState?.showLabels ?? false);
  const [indexMode, setIndexMode] = useState(decodedState?.indexMode ?? "none"); // "none" | slug | "custom"
  const [customExpression, setCustomExpression] = useState(decodedState?.customExpression ?? "");
  const [indexGoal, setIndexGoal] = useState<Goal>(decodedState?.indexGoal ?? "maximize");
  const [levelMaterialIds, setLevelMaterialIds] = useState<number[]>(
    decodedState?.levelMaterialIds ?? [],
  );
  const [numericLevels, setNumericLevels] = useState<number[]>(decodedState?.numericLevels ?? []);
  const [levelDraft, setLevelDraft] = useState("");

  // The selection and the movable line live in the address (D-213).
  const box = live.box;
  const [handingOff, setHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());
  const [focusId, setFocusId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);

  // Records carried over from a selection run, so a study can be read on the
  // map, and the map's own "Mostrar só estes" filter — the same parameter.
  const restrictedIds = useStableIds(
    universe === "process" ? live.restrictProcesses : live.restrictMaterials,
  );
  const highlightIds = useStableIds(parseIdList(params.get("destaque")));
  const explicitSelection = useStableIds(live.selection);

  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: listProperties,
    enabled: universe === "material",
  });
  const classes = useQuery({
    queryKey: ["classes"],
    queryFn: listClasses,
    enabled: universe === "material",
  });
  const indices = useQuery({
    queryKey: ["performance-indices"],
    queryFn: listPerformanceIndices,
    enabled: universe === "material",
  });
  const presets = useQuery({
    queryKey: ["map-presets"],
    queryFn: listMapPresets,
    enabled: universe === "material",
    staleTime: Infinity,
  });
  const processAttributes = useQuery({
    queryKey: ["process-attributes"],
    queryFn: listProcessAttributes,
    enabled: universe === "process",
  });
  const processClasses = useQuery({
    queryKey: ["process-classes"],
    queryFn: listProcessClasses,
    enabled: universe === "process",
  });

  const availableAttributes = useMemo(() => {
    if (universe === "process") {
      // Regra D-59: discretos não compõem eixos de dispersão contínua
      return (processAttributes.data ?? [])
        .filter((a) => a.kind !== "DISCRETO")
        .map((a) => ({ slug: a.slug, name: a.name, canonical_unit: a.canonical_unit }));
    }
    return (properties.data ?? []).map((p) => ({
      slug: p.slug,
      name: p.name,
      canonical_unit: p.canonical_unit,
    }));
  }, [universe, processAttributes.data, properties.data]);

  // D-127: the depth level trims the axis options only — never the axes already
  // chosen, and never the process universe, whose attributes declare no level.
  const depthLevel = useDepthLevel();
  const axisOptions = useMemo(() => {
    if (universe === "process") return availableAttributes;
    const withLevel = (properties.data ?? []).map((p) => ({
      slug: p.slug,
      name: p.name,
      canonical_unit: p.canonical_unit,
      min_level: p.min_level,
    }));
    return optionsAtLevel(withLevel, depthLevel, [xAxis.property, yAxis.property]);
  }, [universe, availableAttributes, properties.data, depthLevel, xAxis.property, yAxis.property]);

  const availableClasses = useMemo(() => {
    if (universe === "process") {
      return (processClasses.data ?? []).map((c) => ({ slug: c.slug, name: c.name }));
    }
    return (classes.data ?? []).map((c) => ({ slug: c.slug, name: c.name }));
  }, [universe, processClasses.data, classes.data]);

  const effectiveXProperty = useMemo(() => {
    if (xAxis.mode === "property") {
      if (xAxis.property) {
        if (
          availableAttributes.length === 0 ||
          availableAttributes.some((p) => p.slug === xAxis.property)
        ) {
          return xAxis.property;
        }
      }
      return availableAttributes[0]?.slug ?? xAxis.property ?? "";
    }
    return xAxis.property;
  }, [xAxis.mode, xAxis.property, availableAttributes]);

  const effectiveYProperty = useMemo(() => {
    if (yAxis.mode === "property") {
      if (yAxis.property) {
        if (
          availableAttributes.length === 0 ||
          availableAttributes.some((p) => p.slug === yAxis.property)
        ) {
          return yAxis.property;
        }
      }
      return (availableAttributes[1] ?? availableAttributes[0])?.slug ?? yAxis.property ?? "";
    }
    return yAxis.property;
  }, [yAxis.mode, yAxis.property, availableAttributes]);

  function handleUniverseChange(next: SelectionUniverse) {
    if (next === universe) return;
    setUniverse(next);
    setSelectedClasses([]);
    setLive({ box: null, selection: [], line: null });
    setXAxis(EMPTY_AXIS);
    setYAxis(EMPTY_AXIS);
    setIndexMode("none");
  }

  const xResolvedIndex = useMemo(
    () => resolveAxisIndex(xAxis, indices.data ?? []),
    [xAxis, indices.data],
  );
  const yResolvedIndex = useMemo(
    () => resolveAxisIndex(yAxis, indices.data ?? []),
    [yAxis, indices.data],
  );
  // The overlay line needs two property axes (ChartService.property_map
  // rejects the combination) — so it is unavailable, not redundant, the
  // moment either axis becomes an index.
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

  const request = useMemo<PropertyMapRequest>(
    () => ({
      universe,
      x: xAxis.mode === "property" ? effectiveXProperty : null,
      y: yAxis.mode === "property" ? effectiveYProperty : null,
      x_index: universe === "material" && xAxis.mode === "index" ? xResolvedIndex : null,
      y_index: universe === "material" && yAxis.mode === "index" ? yResolvedIndex : null,
      scale,
      envelope_shape: envelopeShape,
      class_slugs: selectedClasses,
      material_ids: universe === "material" && restrictedIds.length > 0 ? restrictedIds : null,
      process_ids: universe === "process" && restrictedIds.length > 0 ? restrictedIds : null,
      highlight_material_ids: universe === "material" ? highlightIds : [],
      highlight_process_ids: universe === "process" ? highlightIds : [],
      // Always requested; hiding them is a display choice handled in the
      // component, so ticking the box must not cost a round trip.
      include_envelopes: true,
      index: universe === "material" ? activeIndex : null,
      index_level_material_ids: universe === "material" ? levelMaterialIds : [],
      index_levels: universe === "material" ? numericLevels : [],
    }),
    [
      universe,
      xAxis.mode,
      effectiveXProperty,
      yAxis.mode,
      effectiveYProperty,
      xResolvedIndex,
      yResolvedIndex,
      scale,
      envelopeShape,
      selectedClasses,
      restrictedIds,
      highlightIds,
      activeIndex,
      levelMaterialIds,
      numericLevels,
    ],
  );

  const xReady =
    xAxis.mode === "property" ? Boolean(effectiveXProperty) : xResolvedIndex !== null;
  const yReady =
    yAxis.mode === "property" ? Boolean(effectiveYProperty) : yResolvedIndex !== null;
  const sameProperty =
    xAxis.mode === "property" &&
    yAxis.mode === "property" &&
    Boolean(effectiveXProperty) &&
    effectiveXProperty === effectiveYProperty;
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
  const mapPoints = map.data?.points;

  // --- selection (D-213) -------------------------------------------------

  const pointsInBox = useMemo(() => {
    if (!box || !mapPoints) return [];
    const { xMin, xMax, yMin, yMax } = box;
    return mapPoints
      .filter((p) => {
        if (xMin !== null && p.x < xMin) return false;
        if (xMax !== null && p.x > xMax) return false;
        if (yMin !== null && p.y < yMin) return false;
        if (yMax !== null && p.y > yMax) return false;
        return true;
      })
      .map((p) => p.material_id);
  }, [box, mapPoints]);
  const selectedIds = box ? pointsInBox : explicitSelection;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const plottedIds = useMemo(
    () => new Set((mapPoints ?? []).map((p) => p.material_id)),
    [mapPoints],
  );
  const visiblePoints = useMemo(
    () => (mapPoints ?? []).filter((p) => !hiddenSeries.has(`class:${p.class_slug}`)),
    [mapPoints, hiddenSeries],
  );

  function togglePoint(id: number) {
    const next = selectedSet.has(id)
      ? selectedIds.filter((other) => other !== id)
      : [...selectedIds, id];
    setLive({ box: null, selection: next });
  }

  function handleXAxisChange(next: AxisState) {
    setLive({ box: null });
    setXAxis(next);
  }

  function handleYAxisChange(next: AxisState) {
    setLive({ box: null });
    setYAxis(next);
  }

  function toggleClass(slug: string) {
    setSelectedClasses((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  }

  async function openBoxInSelection() {
    if (!box) return;
    // D-81: the box on screen is in reading units (g/cm³, GPa); the stage
    // stores canonical ones. The backend converts it by the same rule the map
    // was drawn with.
    setHandoffError(null);
    setHandingOff(true);
    let stored;
    try {
      stored = (
        await convertMapBox({
          universe,
          x: xAxis.mode === "property" ? effectiveXProperty : null,
          y: yAxis.mode === "property" ? effectiveYProperty : null,
          box: toMapBox(box),
          to: "canonical",
        })
      ).box;
    } catch (error) {
      setHandoffError(describeApiError(error));
      return;
    } finally {
      setHandingOff(false);
    }
    const query = new URLSearchParams();
    query.set("etapa", "restricoes");
    query.set("novo_estagio", "chart");
    if (universe === "process") query.set("universo", "process");
    if (xAxis.mode === "property") {
      query.set("x_prop", effectiveXProperty);
    } else if (xResolvedIndex) {
      query.set("x_expr", xResolvedIndex.expression);
    }
    if (yAxis.mode === "property") {
      query.set("y_prop", effectiveYProperty);
    } else if (yResolvedIndex) {
      query.set("y_expr", yResolvedIndex.expression);
    }
    if (stored.x_min !== null) query.set("x_min", String(stored.x_min));
    if (stored.x_max !== null) query.set("x_max", String(stored.x_max));
    if (stored.y_min !== null) query.set("y_min", String(stored.y_min));
    if (stored.y_max !== null) query.set("y_max", String(stored.y_max));
    router.push(`/app/selecao?${query.toString()}`);
  }

  function restrictToSelection() {
    const ids = selectedIds;
    setLive({
      box: null,
      selection: [],
      ...(universe === "process" ? { restrictProcesses: ids } : { restrictMaterials: ids }),
    });
  }

  // --- movable index line (D-213) ----------------------------------------

  const lineAxes =
    universe === "material" &&
    xAxis.mode === "property" &&
    yAxis.mode === "property" &&
    Boolean(effectiveXProperty) &&
    Boolean(effectiveYProperty) &&
    !axisConflict;
  const [lineActive, setLineActive] = useState(() => live.line !== null);
  const [dragThrough, setDragThrough] = useState<{ x: number; y: number } | null>(null);
  const debouncedThrough = useDebounced(dragThrough ? JSON.stringify(dragThrough) : null, 90);
  const lineEnabled = lineActive && lineAxes && activeIndex !== null;

  const lineRequest = useMemo<IndexLineRequest | null>(() => {
    if (!lineEnabled || !activeIndex) return null;
    const through = debouncedThrough
      ? (JSON.parse(debouncedThrough) as { x: number; y: number })
      : null;
    return {
      x: effectiveXProperty,
      y: effectiveYProperty,
      scale,
      class_slugs: selectedClasses,
      material_ids: restrictedIds.length > 0 ? restrictedIds : null,
      index: activeIndex,
      level: through ? null : live.line,
      through,
    };
  }, [
    lineEnabled,
    activeIndex,
    debouncedThrough,
    effectiveXProperty,
    effectiveYProperty,
    scale,
    selectedClasses,
    restrictedIds,
    live.line,
  ]);

  const indexLine = useQuery({
    queryKey: ["index-line", JSON.stringify(lineRequest)],
    queryFn: () => moveIndexLine(lineRequest as IndexLineRequest),
    enabled: lineRequest !== null,
    placeholderData: (previous) => previous,
  });

  // A fresh line starts where the backend put it (the median material); that
  // level is then the one in the address.
  useEffect(() => {
    if (!lineEnabled || live.line !== null || dragThrough) return;
    const value = indexLine.data?.value;
    if (value !== null && value !== undefined && !indexLine.isPlaceholderData) {
      setLive({ line: value });
    }
  }, [lineEnabled, live.line, dragThrough, indexLine.data, indexLine.isPlaceholderData, setLive]);

  // A level belongs to its index and axes: when they change, the line starts over.
  const lineContext = `${effectiveXProperty}|${effectiveYProperty}|${activeIndex?.expression ?? ""}|${activeIndex?.goal ?? ""}`;
  const previousContext = useRef(lineContext);
  useEffect(() => {
    if (previousContext.current === lineContext) return;
    previousContext.current = lineContext;
    setLive({ line: null });
  }, [lineContext, setLive]);

  async function handleDragLine(point: { x: number; y: number }, phase: "move" | "end") {
    setDragThrough(point);
    if (phase !== "end" || !lineRequest) return;
    const dropped: IndexLineRequest = { ...lineRequest, level: null, through: point };
    try {
      const result = await queryClient.fetchQuery({
        queryKey: ["index-line", JSON.stringify(dropped)],
        queryFn: () => moveIndexLine(dropped),
      });
      if (result.value !== null) setLive({ line: result.value });
    } catch {
      // The line query reports the failure; the line stays where it was.
    } finally {
      setDragThrough(null);
    }
  }

  const lineData = lineEnabled ? indexLine.data : undefined;
  const movableLine =
    lineData && lineData.available && lineData.value !== null
      ? {
          points: lineData.points,
          handle: lineData.handle,
          label: t.lineLegend(formatNumber(lineData.value)),
        }
      : null;

  // --- presets (D-213) -----------------------------------------------------

  const activePreset =
    universe === "material" && xAxis.mode === "property" && yAxis.mode === "property"
      ? activePresetSlug(
          presets.data,
          effectiveXProperty,
          effectiveYProperty,
          activeIndex?.expression ?? null,
        )
      : null;

  function applyPreset(preset: MapPreset) {
    setXAxis({ ...EMPTY_AXIS, property: preset.x });
    setYAxis({ ...EMPTY_AXIS, property: preset.y });
    setScale(preset.scale);
    setDisplayScale(preset.scale);
    setLevelMaterialIds([]);
    setNumericLevels([]);
    const index = preset.index;
    if (index) {
      const catalogued = index.slug !== null && (indices.data ?? []).some((i) => i.slug === index.slug);
      if (catalogued && index.slug) {
        setIndexMode(index.slug);
      } else {
        setIndexMode("custom");
        setCustomExpression(index.expression);
        setIndexGoal(index.goal);
      }
    } else {
      setIndexMode("none");
    }
    setLive({ box: null, line: null });
    announce(t.presetApplied(preset.name));
  }

  /**
   * D-229: what a click on an AI suggestion changes. Each action goes through
   * the same setters the controls use, so the map and its address follow
   * exactly as if the reader had set it by hand.
   */
  function applyAiAction(action: SuggestAction) {
    if (action.type === "set_axes") {
      setLive({ box: null, line: null });
      setXAxis({ ...EMPTY_AXIS, property: action.x });
      setYAxis({ ...EMPTY_AXIS, property: action.y });
      announce(t.axesApplied);
    } else if (action.type === "apply_preset") {
      const preset = presets.data?.find((p) => p.slug === action.id);
      if (preset) applyPreset(preset);
    } else if (action.type === "set_index") {
      setIndexMode(action.slug);
      announce(t.indexApplied);
    }
  }

  // --- saved and shared maps ---------------------------------------------

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [chartNameDraft, setChartNameDraft] = useState("");
  // D-221: the saved map last opened, for its chip; any later change keeps it
  // marked until another view is opened — the chip says where the map came from.
  const [activeChartId, setActiveChartId] = useState<number | null>(null);
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

  /** Get the current map state as a MapUrlState object. */
  function getCurrentMapState(): MapUrlState {
    return {
      universe,
      xAxis: {
        ...xAxis,
        property: xAxis.mode === "property" ? effectiveXProperty : xAxis.property,
      },
      yAxis: {
        ...yAxis,
        property: yAxis.mode === "property" ? effectiveYProperty : yAxis.property,
      },
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

  // D-213: the map follows the reader into the address — not only when
  // "Compartilhar" is pressed. The landing map stays out of it (a clean URL).
  const currentState = getCurrentMapState();
  const serializedState = JSON.stringify(currentState);
  useEffect(() => {
    const state = JSON.parse(serializedState) as MapUrlState;
    setLive({ state: isDefaultMapState(state) ? null : state });
  }, [serializedState, setLive]);

  /** Save the current configuration with the user-supplied name. */
  async function handleSaveChart() {
    const name = chartNameDraft.trim();
    if (!name) return;
    await createMutation.mutateAsync({
      name,
      configuration: getCurrentMapState() as unknown as Record<string, unknown>,
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
    setActiveChartId(chartId);
    const decoded = chart.configuration as Partial<MapUrlState>;
    const applied = applyMapState(decoded, getCurrentMapState());

    if (applied.universe) setUniverse(applied.universe);
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
    if (mapUsesCustomization(applied)) setCustomizeOpen(true);
    setLive({ box: null, line: null });
  }

  // D-221: a pinned map opens from the Início as `?grafico=<id>` — the saved
  // map is asked for again, applied once, and the parameter leaves the address.
  const openedFromLink = useRef(false);
  const linkedChart = params.get("grafico");
  useEffect(() => {
    if (openedFromLink.current || !linkedChart) return;
    const id = Number(linkedChart);
    if (!Number.isInteger(id) || id <= 0) return;
    openedFromLink.current = true;
    // Applied after the effect (a microtask), as any other async load.
    void Promise.resolve(id)
      .then((chartId) => handleLoadChart(chartId))
      .catch(() => {
        // A pin whose map was deleted: the default map stays, nothing breaks.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [linkedChart]);

  /** Copy the address: it already carries the whole map (D-213). */
  async function shareMap() {
    try {
      await navigator.clipboard.writeText(window.location.href);
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

  // The universe is in the axes panel now, always in view: only what the
  // collapsed panel hides is listed as "in use".
  const inUse = customizationsInUse(currentState).filter((key) => key !== "universe");
  const restrictedCount = restrictedIds.length;

  const customizeActions = {
    onScale: (option: ChartScale) => {
      setDisplayScale(option);
      setScale(option);
    },
    onEnvelopeShape: setEnvelopeShape,
    onShowEnvelopes: setShowEnvelopes,
    onShowIntervals: setShowIntervals,
    onShowLabels: setShowLabels,
    onClearClasses: () => setSelectedClasses([]),
    onToggleClass: toggleClass,
    onIndexMode: setIndexMode,
    onCustomExpression: setCustomExpression,
    onIndexGoal: setIndexGoal,
    onAddLevelMaterial: (id: number) => {
      if (!levelMaterialIds.includes(id)) setLevelMaterialIds([...levelMaterialIds, id]);
    },
    onLevelDraft: setLevelDraft,
    onAddNumericLevel: addNumericLevel,
    onRemoveLevel: removeLevel,
  };
  const movableLineControl = lineAxes ? (
    <IndexLineControl
      active={lineActive}
      line={lineData}
      loading={indexLine.isFetching}
      error={indexLine.isError}
      onActivate={() => setLineActive(true)}
      onRemove={() => {
        setLineActive(false);
        setLive({ line: null });
      }}
      onStep={(value) => setLive({ line: value })}
      onSelectBetter={(ids) => setLive({ box: null, selection: ids })}
    />
  ) : null;

  // D-221: what a folded section holds, so closing it never hides what is in use.
  const partSummary: Record<"appearance" | "classes" | "index", string | null> = {
    appearance: inUse.some((k) => k === "scale" || k === "envelope" || k === "layers")
      ? t.customizeInUse(
          inUse
            .filter((k) => k === "scale" || k === "envelope" || k === "layers")
            .map((k) => t.customizationLabels[k]),
        )
      : null,
    classes: selectedClasses.length > 0 ? t.classesShown(selectedClasses.length) : null,
    index: indexDescriptor ? indexDescriptor.name : null,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        secondaryActions={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSaveDialogOpen(true)}
              title={t.saveTooltip}
            >
              {t.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void shareMap()} title={t.shareTooltip}>
              {t.share}
            </Button>
          </>
        }
      />

      <AISuggestPanel
        tool="mapas"
        context={{
          x: xAxis.mode === "property" && effectiveXProperty ? effectiveXProperty : null,
          y: yAxis.mode === "property" && effectiveYProperty ? effectiveYProperty : null,
          index_slug: indexMode !== "none" && indexMode !== "custom" ? indexMode : null,
        }}
        actions={["set_axes", "apply_preset", "set_index", "open_route"]}
        onAction={applyAiAction}
        disabledReason={universe === "process" ? t.aiMaterialsOnly : undefined}
      />

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

      {/* D-91: the map is the screen. It takes the main column at the
          viewport's height; the panels live beside it on wide screens, and
          under it on a phone — where the map still comes first, because the
          default axes already draw one. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {axisConflict && (
            <Alert tone="warning" role="alert">
              {sameExpression ? t.sameExpressionAxis : t.sameAxis}
            </Alert>
          )}
          {restrictedCount > 0 ? (
            <Alert tone="info">
              <span className="flex flex-wrap items-center gap-2">
                {t.restrictedNotice(restrictedCount)}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setLive(
                      universe === "process" ? { restrictProcesses: [] } : { restrictMaterials: [] },
                    )
                  }
                >
                  {t.showAll}
                </Button>
              </span>
            </Alert>
          ) : null}
          <MapViews
            charts={savedCharts.data}
            activeId={activeChartId}
            onOpen={(id) => void handleLoadChart(id)}
          />
          {map.isLoading && !axisConflict && <LoadingState label={t.loading} />}
          {map.isError && (
            <ErrorState title={t.error} error={map.error} onRetry={() => void map.refetch()} />
          )}

          {map.data && (
            <>
              <AshbyMap
                map={map.data}
                displayScale={displayScale}
                isFetching={map.isFetching}
                fillHeight
                highlightIds={highlightIds}
                showEnvelopes={showEnvelopes}
                showIntervals={showIntervals}
                showLabels={showLabels}
                enableBoxSelect
                enableLasso
                selectionBox={box}
                onSelectBox={(next: BoxSelection | null) => setLive({ box: next, selection: [] })}
                onSelectPoints={(ids) => setLive({ box: null, selection: ids })}
                selectedIds={selectedIds}
                activeId={focusId}
                onHoverPoint={setHoverId}
                hiddenSeries={hiddenSeries}
                onHiddenSeriesChange={setHiddenSeries}
                movableLine={movableLine}
                onDragLine={(point, phase) => void handleDragLine(point, phase)}
                reportExport
                recordLabel={universe === "process" ? t.columnProcess : undefined}
              />

              <PointList
                points={visiblePoints}
                xAxis={map.data.x_axis}
                yAxis={map.data.y_axis}
                selected={selectedSet}
                hoverId={hoverId}
                onFocusPoint={setFocusId}
                onToggle={togglePoint}
                recordLabel={universe === "process" ? t.columnProcess : undefined}
              />

              {map.data.notes.length > 0 && (
                <Section id="observacoes" title={t.notesTitle} headingLevel={2}>
                  <Card>
                    <CardBody>
                      <ul className="flex flex-col gap-1 text-caption text-ink-muted">
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
                      <ul className="flex flex-col gap-1 text-body text-ink">
                        {map.data.excluded.map((e) => (
                          <li key={e.record_id ?? e.material_id}>
                            <span className="font-medium">{e.name}</span>{" "}
                            <span className="text-ink-muted">— {e.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                </Section>
              )}

              {universe === "material" && map.data.points.length > 0 && (
                <div>
                  <ButtonLink
                    href={`/app/comparar?materiais=${encodeIdList(map.data.points.map((p) => p.material_id))}`}
                    size="sm"
                  >
                    {t.compareSelected} →
                  </ButtonLink>
                </div>
              )}
            </>
          )}
        </div>

        {/* D-221: the inspector (Figma's right panel) — the question, the
            axes and the drawing options as sections that fold, beside the map
            on a wide screen; below lg the same inspector is a standard bottom
            sheet whose head peeks over the map, so the map takes the width. */}
        <aside
          id="controles"
          aria-labelledby="controles-titulo"
          data-open={sheetOpen ? "true" : "false"}
          // Below the sticky search bar (72 px, as the supporting pane of D-182),
          // not under it (D-190).
          className="ds-map-sheet lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-72px-1.5rem)] lg:overflow-y-auto lg:overscroll-contain"
        >
          <button
            type="button"
            className="ds-map-sheet-toggle m3-state"
            aria-expanded={sheetOpen}
            aria-controls="controles-corpo"
            onClick={() => setSheetOpen((o) => !o)}
          >
            <span aria-hidden className="m3-bottom-sheet-handle" />
            <span className="text-body font-medium text-ink">
              {sheetOpen ? t.inspectorClose : t.inspectorOpen}
            </span>
          </button>
          <div id="controles-corpo" className="ds-map-sheet-body">
            <h2 id="controles-titulo" className="sr-only">
              {t.inspectorTitle}
            </h2>
            <div className="ds-inspector">
              <InspectorSection
                title={t.selectionTitle}
                headingId="selecao-mapa-titulo"
                summary={selectedIds.length > 0 ? t.selectionCount(selectedIds.length) : null}
                open={sectionOpen("selection")}
                onOpenChange={(next) => setSection("selection", next)}
              >
                <SelectionPanel
                  universe={universe}
                  selectedIds={selectedIds}
                  plottedIds={plottedIds}
                  box={box}
                  xUnit={map.data?.x_axis.unit ?? ""}
                  yUnit={map.data?.y_axis.unit ?? ""}
                  handingOff={handingOff}
                  handoffError={handoffError}
                  onOpenInSelection={() => void openBoxInSelection()}
                  onRestrict={restrictToSelection}
                  onClear={() => setLive({ box: null, selection: [] })}
                />
              </InspectorSection>
              <InspectorSection
                title={t.axesTitle}
                summary={map.data ? `${map.data.y_axis.property_name} × ${map.data.x_axis.property_name}` : null}
                open={sectionOpen("axes")}
                onOpenChange={(next) => setSection("axes", next)}
              >
                <AxesPanel
                  universe={universe}
                  onUniverse={handleUniverseChange}
                  depthSummary={
                    universe === "material"
                      ? ptBR.depth.optionsCount(
                          depthLevel,
                          optionsAtLevel(properties.data ?? [], depthLevel).length,
                          properties.data?.length ?? 0,
                        )
                      : null
                  }
                  presets={presets.data}
                  presetsError={presets.isError}
                  activePreset={activePreset}
                  onPreset={applyPreset}
                  xAxis={{ ...xAxis, property: effectiveXProperty }}
                  yAxis={{ ...yAxis, property: effectiveYProperty }}
                  onXAxis={handleXAxisChange}
                  onYAxis={handleYAxisChange}
                  allowIndex={{
                    x: universe === "material" && (customizeVisible || xAxis.mode === "index"),
                    y: universe === "material" && (customizeVisible || yAxis.mode === "index"),
                  }}
                  axisOptions={axisOptions}
                  indices={universe === "material" ? (indices.data ?? []) : []}
                  xDimension={map.data?.x_axis.is_index ? map.data.x_axis.unit : undefined}
                  yDimension={map.data?.y_axis.is_index ? map.data.y_axis.unit : undefined}
                />
              </InspectorSection>
              {(["appearance", "classes", "index"] as const).map((part) => (
                <InspectorSection
                  key={part}
                  title={t.inspectorParts[part]}
                  summary={partSummary[part]}
                  open={sectionOpen(part)}
                  onOpenChange={(next) => setSection(part, next)}
                >
                  <CustomizePanel
                    part={part}
                    state={{
                      universe,
                      displayScale,
                      envelopeShape,
                      showEnvelopes,
                      showIntervals,
                      showLabels,
                      selectedClasses,
                      indexMode,
                      customExpression,
                      indexGoal,
                      levelMaterialIds,
                      levelDraft,
                    }}
                    actions={customizeActions}
                    classes={availableClasses}
                    indices={indices.data ?? []}
                    anyAxisIsIndex={anyAxisIsIndex}
                    indexDescriptor={indexDescriptor}
                    overlay={overlay}
                    hasActiveIndex={activeIndex !== null}
                    points={map.data?.points ?? []}
                    movableLine={movableLineControl}
                  />
                </InspectorSection>
              ))}
            </div>
          </div>
        </aside>
      </div>
      {/* D-221: below lg, room for the inspector's head over the last row. */}
      <div aria-hidden className="ds-map-sheet-spacer" />
    </div>
  );
}

type InspectorPart = "selection" | "axes" | "appearance" | "classes" | "index";

export default function MapsPage() {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense fallback={<LoadingState label={t.loading} />}>
      <MapsPageContent />
    </Suspense>
  );
}
