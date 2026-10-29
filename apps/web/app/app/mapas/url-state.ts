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
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return sanitizeMapState(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

const isString = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const oneOf =
  <T extends string>(...allowed: T[]) =>
  (v: unknown): v is T =>
    typeof v === "string" && (allowed as string[]).includes(v);
const isGoal = oneOf<Goal>("maximize", "minimize");

function isAxisState(v: unknown): v is AxisState {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const a = v as Record<string, unknown>;
  return (
    oneOf("property", "index")(a.mode) &&
    isString(a.property) &&
    isString(a.indexSlug) &&
    isString(a.customExpression) &&
    isGoal(a.goal)
  );
}

/**
 * A decoded link is untrusted input: it may be hand-edited or come from another
 * version. Each field is kept only if it has the right shape and type, otherwise
 * it is dropped (so the page default applies) — never repaired, never thrown on.
 */
function sanitizeMapState(raw: Record<string, unknown>): Partial<MapUrlState> {
  const out: Partial<MapUrlState> = {};
  const own = (key: string): unknown => (Object.hasOwn(raw, key) ? raw[key] : undefined);
  const universe = own("universe");
  if (oneOf<SelectionUniverse>("material", "process")(universe)) out.universe = universe;
  const xAxis = own("xAxis");
  if (isAxisState(xAxis)) out.xAxis = xAxis;
  const yAxis = own("yAxis");
  if (isAxisState(yAxis)) out.yAxis = yAxis;
  const scale = own("scale");
  if (oneOf<ChartScale>("linear", "log")(scale)) out.scale = scale;
  const envelopeShape = own("envelopeShape");
  if (oneOf<"hull" | "ellipse">("hull", "ellipse")(envelopeShape)) {
    out.envelopeShape = envelopeShape;
  }
  const selectedClasses = own("selectedClasses");
  if (Array.isArray(selectedClasses) && selectedClasses.every(isString)) {
    out.selectedClasses = selectedClasses;
  }
  for (const key of ["showEnvelopes", "showIntervals", "showLabels"] as const) {
    const value = own(key);
    if (isBool(value)) out[key] = value;
  }
  const indexMode = own("indexMode");
  if (isString(indexMode)) out.indexMode = indexMode;
  const customExpression = own("customExpression");
  if (isString(customExpression)) out.customExpression = customExpression;
  const indexGoal = own("indexGoal");
  if (isGoal(indexGoal)) out.indexGoal = indexGoal;
  const levelMaterialIds = own("levelMaterialIds");
  if (
    Array.isArray(levelMaterialIds) &&
    levelMaterialIds.every((n) => typeof n === "number" && Number.isInteger(n) && n > 0)
  ) {
    out.levelMaterialIds = levelMaterialIds;
  }
  const numericLevels = own("numericLevels");
  if (
    Array.isArray(numericLevels) &&
    numericLevels.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    out.numericLevels = numericLevels;
  }
  return out;
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
