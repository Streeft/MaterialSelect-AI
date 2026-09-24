// Presentation-side helpers for the property map and the comparator.
//
// Strictly cosmetic and structural: colours, coordinate unpacking, file names
// and image export. No value is computed, converted or interpolated here — all
// numbers arrive ready from the backend (see app/services/chart_service.py).

import type { CoordinatePair } from "./types";

// Colour, marker shape and dash pattern live in `lib/design/palette.ts`, which
// is also what `/estilo` documents. This file used to carry a second palette of
// its own; two palettes is how a report ends up looking like it came from two
// tools, and the one here was colour-only — no shape, nothing left on a
// monochrome printout.

/** Unicode combining marks, left behind by NFD decomposition. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Escape text before interpolating it into a Plotly hover string.
 *
 * Plotly renders `hovertext`/`hovertemplate` as rich text, interpreting a
 * subset of HTML tags. Material and class names reach us from the catalogue
 * and from imported spreadsheets \u2014 that is untrusted input, and a name
 * containing markup would otherwise be interpreted rather than displayed. The
 * markup we add ourselves (`<b>`, `<br>`) is written outside these calls.
 */
export function escapeHover(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Pick a short label per property, falling back to the full name when a symbol
 * is shared.
 *
 * Two properties may legitimately carry the same symbol (\u03c3 for yield and for
 * tensile strength, say). On a categorical Plotly axis, two identical labels
 * collapse into one column and the series silently merge \u2014 so an ambiguous
 * symbol must give way to the unambiguous name.
 */
export function axisLabels(
  properties: { symbol: string | null; property_name: string }[],
): string[] {
  const counts = new Map<string, number>();
  for (const property of properties) {
    if (property.symbol) {
      counts.set(property.symbol, (counts.get(property.symbol) ?? 0) + 1);
    }
  }
  return properties.map((property) =>
    property.symbol && counts.get(property.symbol) === 1
      ? property.symbol
      : property.property_name,
  );
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
 * Export the figure inside `container` as a PNG or SVG download.
 *
 * Works for both kinds of figure the application draws since D-80: a Plotly
 * map (asked for its own SVG through the same custom bundle `react-plotly.js`
 * is aliased to in `next.config.mjs`, so no second copy of the library is
 * pulled in) and an MSDS SVG figure (cloned with every colour resolved, because
 * the app's `rgb(var(--token))` colours mean nothing outside the page). Both
 * leave with the card's title above, the legend below and an opaque background;
 * PNG is rasterised at 2× for legibility in printed reports, SVG is
 * resolution-independent and is the right choice for the monograph.
 *
 * Imported lazily: the export code is only needed on a click.
 */
export async function downloadChartImage(
  container: HTMLElement | null,
  format: "png" | "svg",
  fileName: string,
): Promise<void> {
  const { exportFigure } = await import("./figureExport");
  await exportFigure(container, format, fileName);
}
