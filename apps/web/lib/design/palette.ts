/**
 * The bridge between the CSS tokens and the chart layer.
 *
 * Plotly cannot read Tailwind classes, so without this module the figures would
 * carry a second, hand-maintained palette that drifts from the interface — and
 * that drift is exactly what makes a report look like it came from two tools.
 *
 * Nothing here computes chart *geometry*. Slopes, envelopes and normalised
 * scores come from the backend in data coordinates (ADR 0004); this file only
 * decides what colour and what marker shape draws them.
 */

import type { Layout } from "plotly.js";

/**
 * The symbol and dash are typed as the literal unions the arrays below already
 * guarantee, not as `string`: Plotly's own props accept only its vocabulary, and
 * a widened type here would force a cast at every call site — which is exactly
 * where a typo would stop being a compile error.
 */
export type ClassSymbol = (typeof SYMBOLS)[number];
export type ClassDash = (typeof DASHES)[number];

/** Material classes, as one shape-and-colour pair per class. */
export interface ClassVisual {
  /** CSS colour, safe to hand to Plotly. */
  color: string;
  /** Plotly marker symbol. The greyscale- and CVD-safe half of the encoding. */
  symbol: ClassSymbol;
  /** Dash pattern for envelope outlines, so class survives a mono printout. */
  dash: ClassDash;
}

/**
 * Okabe–Ito, the reference palette for colour-vision deficiency. Every pair in
 * it stays distinguishable under deuteranopia and protanopia, which is why the
 * obvious red/green choice is absent.
 *
 * Greyscale is a separate problem: five hues cannot all separate by luminance
 * on a monochrome print. The marker *shape* carries the class there, and every
 * legend entry is written out in words. Colour is never the only cue.
 */
export const OKABE_ITO = [
  "#0072B2", // azul
  "#E69F00", // laranja
  "#009E73", // verde-azulado
  "#CC79A7", // roxo-rosado
  "#D55E00", // vermelhão
  "#56B4E9", // azul-céu
  "#F0E442", // amarelo
] as const;

const SYMBOLS = ["circle", "square", "diamond", "triangle-up", "x", "star", "hexagon"] as const;

const DASHES = ["solid", "dash", "dot", "dashdot", "longdash", "longdashdot", "solid"] as const;

/**
 * Fixed seats for the seeded taxonomy, so the demo dataset looks deliberate
 * rather than hashed. Anything outside this map still gets a stable seat — see
 * `classVisual` — because the catalogue is user-extensible.
 */
const SEATED: Record<string, number> = {
  metais: 0,
  polimeros: 1,
  ceramicas: 2,
  compositos: 3,
  elastomeros: 4,
};

/** Small, stable string hash. Same slug ⇒ same seat, across pages and sessions. */
function seat(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) {
    h = (h * 31 + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % OKABE_ITO.length;
}

/**
 * The colour, marker and dash for a material class.
 *
 * Keyed by slug rather than by position in a list: a class added to the
 * catalogue must not repaint every other class in a report the user already
 * printed.
 */
export function classVisual(slug: string): ClassVisual {
  const i = SEATED[slug] ?? seat(slug);
  return {
    color: OKABE_ITO[i] ?? OKABE_ITO[0],
    symbol: SYMBOLS[i] ?? SYMBOLS[0],
    dash: DASHES[i] ?? DASHES[0],
  };
}

/** Every seat, in order — for legends and for the style showcase. */
export function paletteSeats(): ClassVisual[] {
  return OKABE_ITO.map((_, i) => ({
    color: OKABE_ITO[i] ?? OKABE_ITO[0],
    symbol: SYMBOLS[i] ?? SYMBOLS[0],
    dash: DASHES[i] ?? DASHES[0],
  }));
}

// --- Reading the live theme -------------------------------------------------

export type ResolvedTheme = "light" | "dark";

/**
 * Fallbacks for the server render and for jsdom, which has no computed styles.
 *
 * Both themes are listed because the fallback has to answer the same question
 * the stylesheet would: a figure rendered before hydration under the dark theme
 * with light-theme fallbacks flashes a white chart on a dark page.
 */
const FALLBACK: Record<ResolvedTheme, Record<string, string>> = {
  light: {
    "--surface": "250 250 249",
    "--surface-raised": "255 255 255",
    "--edge": "231 229 228",
    "--edge-strong": "214 211 209",
    "--ink": "12 15 17",
    "--ink-muted": "68 64 60",
    "--ink-subtle": "100 98 94",
    "--accent": "84 112 14",
    "--danger": "199 56 40",
  },
  dark: {
    "--surface": "5 8 10",
    "--surface-raised": "11 15 18",
    "--edge": "25 28 30",
    "--edge-strong": "55 57 59",
    "--ink": "240 244 242",
    "--ink-muted": "175 181 178",
    "--ink-subtle": "131 137 134",
    "--accent": "198 249 31",
    "--danger": "251 124 104",
  },
};

/**
 * Read a design token as a CSS colour.
 *
 * Returns `rgb(r g b)` because that is what Plotly accepts and what the token
 * already stores; callers that need alpha pass one. `theme` only decides which
 * fallback applies — whenever the document is available, the document wins.
 */
export function token(name: string, alpha = 1, theme: ResolvedTheme = "light"): string {
  let triple = FALLBACK[theme][name] ?? FALLBACK.light[name] ?? "0 0 0";
  if (typeof window !== "undefined") {
    const read = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (read) triple = read;
  }
  return alpha === 1 ? `rgb(${triple})` : `rgb(${triple} / ${alpha})`;
}

/** Everything a figure needs from the theme, read once per render. */
export interface ChartTheme {
  /** Plotly layout fragment. Presentation only — no range, no slope. */
  layout: Partial<Layout>;
  /** The colour that marks "this is the material you asked about". */
  highlight: string;
  /** Outline around a marker, so overlapping points stay countable. */
  markerEdge: string;
  /** Point labels and other secondary text drawn inside the figure. */
  label: string;
  /** Foreground ink, for lines the backend computed (index levels). */
  ink: string;
}

/**
 * The chart-side view of the current theme.
 *
 * Takes the resolved theme rather than reading it, for two reasons: it decides
 * the fallback when there is no document to measure, and it makes the value a
 * real input, so a component that re-renders on theme change also rebuilds its
 * figure instead of keeping the colours it computed on first paint.
 */
export function chartTheme(theme: ResolvedTheme): ChartTheme {
  const read = (name: string, alpha = 1) => token(name, alpha, theme);
  const ink = read("--ink");
  const muted = read("--ink-muted");
  // `--edge-strong`, not `--edge`: the hairline that separates two panels sitting
  // side by side is not the same job as a gridline a reader has to follow across
  // a figure. On the near-black surface the softer token disappears entirely.
  const grid = read("--edge-strong");
  return {
    highlight: read("--danger"),
    markerEdge: read("--surface-raised"),
    label: muted,
    ink,
    layout: {
      // Transparent, so the figure sits on the card instead of punching a white
      // rectangle through it.
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        // Plotly draws into an SVG and cannot resolve `var(--font-sans)`, so the
        // family is named here. Inter first, then the same fallback chain the
        // stylesheet uses — a figure set in a different face than the table
        // beside it is the drift this module exists to prevent.
        family:
          "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        color: ink,
        size: 12,
      },
      xaxis: { gridcolor: grid, zerolinecolor: grid, linecolor: grid, tickfont: { color: muted } },
      yaxis: { gridcolor: grid, zerolinecolor: grid, linecolor: grid, tickfont: { color: muted } },
      legend: { font: { color: muted } },
      hoverlabel: {
        bgcolor: read("--surface-raised"),
        bordercolor: read("--edge-strong"),
        font: { color: ink },
      },
    },
  };
}
