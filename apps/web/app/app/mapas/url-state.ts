import type { ChartScale, Goal, SelectionUniverse } from "@/lib/types";

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

export interface MapUrlState {
  universe?: SelectionUniverse;
  xAxis: AxisState;
  yAxis: AxisState;
  scale: ChartScale;
  envelopeShape: "hull" | "ellipse";
  selectedClasses: string[];
  showEnvelopes: boolean;
  showIntervals: boolean;
  showLabels: boolean;
  indexMode: string;
  customExpression: string;
  indexGoal: Goal;
  levelMaterialIds: number[];
  numericLevels: number[];
}

/** Opaque, URL-safe encoding of the full filter state, for the "share" link. */
export function encodeMapState(state: MapUrlState): string {
  const json = JSON.stringify(state);
  // btoa operates on UTF-16 code units; encodeURIComponent/unescape round-trip
  // handles non-ASCII (e.g. a custom expression with "±") before btoa, and
  // base64url (- and _ instead of + and /) keeps the result safe unescaped in
  // a query string.
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of encodeMapState. Returns null on any malformed input — a bad or
 * tampered link degrades to the page's normal defaults, never a crash. */
export function decodeMapState(param: string): Partial<MapUrlState> | null {
  try {
    const base64 = param.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(base64)));
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Partial<MapUrlState>;
  } catch {
    return null;
  }
}

/** Apply a partial state to the page's current state; missing fields use defaults. */
export function applyMapState(
  decoded: Partial<MapUrlState> | null,
  defaults: MapUrlState,
): Partial<MapUrlState> {
  if (!decoded) return {};
  return {
    universe: decoded.universe ?? defaults.universe,
    xAxis: decoded.xAxis ?? defaults.xAxis,
    yAxis: decoded.yAxis ?? defaults.yAxis,
    scale: decoded.scale ?? defaults.scale,
    envelopeShape: decoded.envelopeShape ?? defaults.envelopeShape,
    selectedClasses: decoded.selectedClasses ?? defaults.selectedClasses,
    showEnvelopes: decoded.showEnvelopes ?? defaults.showEnvelopes,
    showIntervals: decoded.showIntervals ?? defaults.showIntervals,
    showLabels: decoded.showLabels ?? defaults.showLabels,
    indexMode: decoded.indexMode ?? defaults.indexMode,
    customExpression: decoded.customExpression ?? defaults.customExpression,
    indexGoal: decoded.indexGoal ?? defaults.indexGoal,
    levelMaterialIds: decoded.levelMaterialIds ?? defaults.levelMaterialIds,
    numericLevels: decoded.numericLevels ?? defaults.numericLevels,
  };
}

/** What the reader changed in "Personalizar o mapa", named rather than counted. */
export type MapCustomization = "universe" | "scale" | "envelope" | "classes" | "layers" | "index";

/**
 * Which of the collapsed controls hold something other than the map a reader
 * lands on with no link (D-86). Missing fields are the defaults, so a partial
 * state decoded from an old link reads the same way.
 *
 * The axes are not here: they are never collapsed, and an axis drawn as an
 * index keeps its own property/index toggle on screen.
 */
export function customizationsInUse(state: Partial<MapUrlState> | null): MapCustomization[] {
  if (!state) return [];
  const used: MapCustomization[] = [];
  if ((state.universe ?? "material") !== "material") used.push("universe");
  if ((state.scale ?? "log") !== "log") used.push("scale");
  if ((state.envelopeShape ?? "ellipse") !== "ellipse") used.push("envelope");
  if ((state.selectedClasses ?? []).length > 0) used.push("classes");
  if (
    state.showEnvelopes === false ||
    state.showIntervals === false ||
    state.showLabels === true
  ) {
    used.push("layers");
  }
  if (
    (state.indexMode ?? "none") !== "none" ||
    (state.levelMaterialIds ?? []).length > 0 ||
    (state.numericLevels ?? []).length > 0
  ) {
    used.push("index");
  }
  return used;
}

/** Whether "Personalizar o mapa" opens by itself: collapsed never hides what is in use. */
export function mapUsesCustomization(state: Partial<MapUrlState> | null): boolean {
  return customizationsInUse(state).length > 0;
}
