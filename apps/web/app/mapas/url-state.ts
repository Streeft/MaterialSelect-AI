import type { AxisState } from "./page";
import type { ChartScale, Goal } from "@/lib/types";

export interface MapUrlState {
  xAxis: AxisState;
  yAxis: AxisState;
  scale: ChartScale;
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
    xAxis: decoded.xAxis ?? defaults.xAxis,
    yAxis: decoded.yAxis ?? defaults.yAxis,
    scale: decoded.scale ?? defaults.scale,
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
