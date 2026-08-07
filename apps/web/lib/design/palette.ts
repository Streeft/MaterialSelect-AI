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

/** Material classes, as one shape-and-colour pair per class. */
export interface ClassVisual {
  /** CSS colour, safe to hand to Plotly. */
  color: string;
  /** Plotly marker symbol. The greyscale- and CVD-safe half of the encoding. */
  symbol: string;
  /** Dash pattern for envelope outlines, so class survives a mono printout. */
  dash: string;
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

/** Fallbacks for the server render and for jsdom, which has no computed styles. */
const FALLBACK: Record<string, string> = {
  "--surface": "248 250 252",
  "--surface-raised": "255 255 255",
  "--edge": "226 232 240",
  "--ink": "15 23 42",
  "--ink-muted": "71 85 105",
  "--ink-subtle": "100 116 139",
  "--accent": "37 99 235",
};

/**
 * Read a design token as a CSS colour.
 *
 * Returns `rgb(r g b)` because that is what Plotly accepts and what the token
 * already stores; callers that need alpha should use `token(name, 0.4)`.
 */
export function token(name: string, alpha = 1): string {
  let triple = FALLBACK[name] ?? "0 0 0";
  if (typeof window !== "undefined") {
    const read = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (read) triple = read;
  }
  return alpha === 1 ? `rgb(${triple})` : `rgb(${triple} / ${alpha})`;
}

/**
 * Plotly layout fragment that matches the current theme.
 *
 * Spread it into every figure's `layout`. It is presentation only — no axis
 * range, no slope, nothing the backend is responsible for.
 */
export function chartLayoutTheme() {
  const ink = token("--ink");
  const muted = token("--ink-muted");
  const grid = token("--edge");
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      family:
        "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      color: ink,
      size: 12,
    },
    xaxis: { gridcolor: grid, zerolinecolor: grid, linecolor: grid, tickfont: { color: muted } },
    yaxis: { gridcolor: grid, zerolinecolor: grid, linecolor: grid, tickfont: { color: muted } },
    legend: { font: { color: muted } },
    hoverlabel: {
      bgcolor: token("--surface-raised"),
      bordercolor: token("--edge-strong"),
      font: { color: ink },
    },
  };
}
