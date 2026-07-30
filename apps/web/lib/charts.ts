// Presentation-side helpers for the property map and the comparator.
//
// Strictly cosmetic and structural: colours, coordinate unpacking, file names
// and image export. No value is computed, converted or interpolated here — all
// numbers arrive ready from the backend (see app/services/chart_service.py).

import type { CoordinatePair } from "./types";

/**
 * Categorical palette for material classes. Hues are spaced far enough apart to
 * stay distinguishable under the common forms of colour-vision deficiency, and
 * dark enough to read as an outline on white.
 */
export const CLASS_PALETTE = [
  "#2563eb", // blue
  "#059669", // green
  "#d97706", // amber
  "#7c3aed", // violet
  "#db2777", // pink
  "#0891b2", // cyan
  "#65a30d", // lime
  "#b45309", // brown
] as const;

export const HIGHLIGHT_COLOR = "#dc2626";

/** Unicode combining marks, left behind by NFD decomposition. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Assign one palette entry per class, deterministically.
 *
 * Classes are user-editable, so colours cannot be hard-coded per slug: sorting
 * the slugs before assigning keeps a given chart stable across re-renders and
 * across reloads, which matters when a figure goes into a report.
 */
export function classColors(slugs: string[]): Record<string, string> {
  const unique = Array.from(new Set(slugs)).sort();
  const colors: Record<string, string> = {};
  unique.forEach((slug, position) => {
    colors[slug] = CLASS_PALETTE[position % CLASS_PALETTE.length] as string;
  });
  return colors;
}

/** Add an alpha channel to a `#rrggbb` colour, for envelope fills. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Split `[[x, y], …]` into parallel arrays, skipping malformed pairs.
 *
 * The API always sends well-formed pairs; the guard exists so a truncated
 * response degrades into a shorter line instead of `NaN` coordinates.
 */
export function toXY(pairs: CoordinatePair[]): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const pair of pairs) {
    const [x, y] = pair;
    if (typeof x !== "number" || typeof y !== "number") continue;
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

/** Unpack a polygon and repeat its first vertex so the outline closes. */
export function toClosedRing(pairs: CoordinatePair[]): { xs: number[]; ys: number[] } {
  const { xs, ys } = toXY(pairs);
  if (xs.length < 3) return { xs, ys };
  return { xs: [...xs, xs[0] as number], ys: [...ys, ys[0] as number] };
}

/**
 * Build a safe, descriptive file name from free-form parts.
 *
 * Accents are folded, anything outside `[a-z0-9]` becomes a hyphen and runs are
 * collapsed, so "Módulo de Young × Densidade" downloads as
 * `modulo-de-young-densidade`.
 */
export function chartFileName(...parts: (string | null | undefined)[]): string {
  const slug = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("-")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "grafico";
}

/**
 * Export the Plotly figure inside `container` as a PNG or SVG download.
 *
 * Uses the very Plotly instance `react-plotly.js` already loaded, so no second
 * copy of the library is pulled into the bundle. PNG is rendered at 2× for
 * legibility in printed reports; SVG is resolution-independent and is the right
 * choice for the monograph.
 */
export async function downloadPlotImage(
  container: HTMLElement | null,
  format: "png" | "svg",
  fileName: string,
): Promise<void> {
  const graph = container?.querySelector<HTMLElement>(".js-plotly-plot");
  if (!graph) throw new Error("Gráfico ainda não renderizado.");

  const plotly = (await import("plotly.js/dist/plotly")).default;
  const dataUrl = await plotly.toImage(graph, {
    format,
    width: graph.clientWidth || 1100,
    height: graph.clientHeight || 640,
    scale: format === "png" ? 2 : 1,
  });

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${fileName}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
