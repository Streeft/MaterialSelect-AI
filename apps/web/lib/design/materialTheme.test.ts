import { describe, expect, it } from "vitest";

import { buildMdSysColorScheme, M3_SEED_HEX } from "./materialTheme";
import { SECTIONS, type SectionId } from "./sections";

/**
 * Locks the generator's output against the literal hex values pasted into
 * app/globals.css, for every M3 role EXCEPT `primary` and
 * `primary-container` — those two are no longer generated from
 * M3_SEED_HEX (see PER_SECTION below). If a role in this list ever fails,
 * the seed or the algorithm changed — update globals.css to match
 * (regenerate with this same function) rather than editing the values
 * below to make it pass.
 */
const LIGHT_NON_PRIMARY: Record<string, string> = {
  "--md-sys-color-on-primary": "#ffffff",
  "--md-sys-color-primary-fixed": "#d8e2ff",
  "--md-sys-color-primary-fixed-dim": "#adc7ff",
  "--md-sys-color-on-primary-fixed": "#001a41",
  "--md-sys-color-on-primary-fixed-variant": "#004493",
  "--md-sys-color-inverse-primary": "#adc7ff",
  "--md-sys-color-secondary": "#475e8c",
  "--md-sys-color-on-secondary": "#ffffff",
  "--md-sys-color-secondary-container": "#b2c9fe",
  "--md-sys-color-on-secondary-container": "#3d5481",
  "--md-sys-color-secondary-fixed": "#d8e2ff",
  "--md-sys-color-secondary-fixed-dim": "#afc7fb",
  "--md-sys-color-on-secondary-fixed": "#001a41",
  "--md-sys-color-on-secondary-fixed-variant": "#2e4673",
  "--md-sys-color-tertiary": "#8c36ab",
  "--md-sys-color-on-tertiary": "#ffffff",
  "--md-sys-color-tertiary-container": "#a851c6",
  "--md-sys-color-on-tertiary-container": "#ffffff",
  "--md-sys-color-tertiary-fixed": "#fad7ff",
  "--md-sys-color-tertiary-fixed-dim": "#efb0ff",
  "--md-sys-color-on-tertiary-fixed": "#330045",
  "--md-sys-color-on-tertiary-fixed-variant": "#721791",
  "--md-sys-color-error": "#ba1a1a",
  "--md-sys-color-on-error": "#ffffff",
  "--md-sys-color-error-container": "#ffdad6",
  "--md-sys-color-on-error-container": "#93000a",
  "--md-sys-color-background": "#f9f9ff",
  "--md-sys-color-on-background": "#191c23",
  "--md-sys-color-surface": "#f9f9ff",
  "--md-sys-color-on-surface": "#191c23",
  "--md-sys-color-surface-variant": "#dee2f2",
  "--md-sys-color-on-surface-variant": "#414754",
  "--md-sys-color-surface-dim": "#d8d9e3",
  "--md-sys-color-surface-bright": "#f9f9ff",
  "--md-sys-color-surface-container-lowest": "#ffffff",
  "--md-sys-color-surface-container-low": "#f2f3fd",
  "--md-sys-color-surface-container": "#ecedf7",
  "--md-sys-color-surface-container-high": "#e6e8f2",
  "--md-sys-color-surface-container-highest": "#e0e2ec",
  "--md-sys-color-surface-tint": "#005bc0",
  "--md-sys-color-outline": "#727785",
  "--md-sys-color-outline-variant": "#c1c6d6",
  "--md-sys-color-shadow": "#000000",
  "--md-sys-color-scrim": "#000000",
  "--md-sys-color-inverse-surface": "#2d3038",
  "--md-sys-color-inverse-on-surface": "#eff0fa",
};

const DARK_NON_PRIMARY: Record<string, string> = {
  "--md-sys-color-on-primary": "#002e68",
  "--md-sys-color-primary-fixed": "#d8e2ff",
  "--md-sys-color-primary-fixed-dim": "#adc7ff",
  "--md-sys-color-on-primary-fixed": "#001a41",
  "--md-sys-color-on-primary-fixed-variant": "#004493",
  "--md-sys-color-inverse-primary": "#005bc0",
  "--md-sys-color-secondary": "#afc7fb",
  "--md-sys-color-on-secondary": "#15305b",
  "--md-sys-color-secondary-container": "#2e4673",
  "--md-sys-color-on-secondary-container": "#9eb5e8",
  "--md-sys-color-secondary-fixed": "#d8e2ff",
  "--md-sys-color-secondary-fixed-dim": "#afc7fb",
  "--md-sys-color-on-secondary-fixed": "#001a41",
  "--md-sys-color-on-secondary-fixed-variant": "#2e4673",
  "--md-sys-color-tertiary": "#efb0ff",
  "--md-sys-color-on-tertiary": "#53006e",
  "--md-sys-color-tertiary-container": "#a851c6",
  "--md-sys-color-on-tertiary-container": "#ffffff",
  "--md-sys-color-tertiary-fixed": "#fad7ff",
  "--md-sys-color-tertiary-fixed-dim": "#efb0ff",
  "--md-sys-color-on-tertiary-fixed": "#330045",
  "--md-sys-color-on-tertiary-fixed-variant": "#721791",
  "--md-sys-color-error": "#ffb4ab",
  "--md-sys-color-on-error": "#690005",
  "--md-sys-color-error-container": "#93000a",
  "--md-sys-color-on-error-container": "#ffdad6",
  "--md-sys-color-background": "#10131a",
  "--md-sys-color-on-background": "#e0e2ec",
  "--md-sys-color-surface": "#10131a",
  "--md-sys-color-on-surface": "#e0e2ec",
  "--md-sys-color-surface-variant": "#414754",
  "--md-sys-color-on-surface-variant": "#c1c6d6",
  "--md-sys-color-surface-dim": "#10131a",
  "--md-sys-color-surface-bright": "#363941",
  "--md-sys-color-surface-container-lowest": "#0b0e15",
  "--md-sys-color-surface-container-low": "#191c23",
  "--md-sys-color-surface-container": "#1d2027",
  "--md-sys-color-surface-container-high": "#272a31",
  "--md-sys-color-surface-container-highest": "#32353c",
  "--md-sys-color-surface-tint": "#adc7ff",
  "--md-sys-color-outline": "#8b909f",
  "--md-sys-color-outline-variant": "#414754",
  "--md-sys-color-shadow": "#000000",
  "--md-sys-color-scrim": "#000000",
  "--md-sys-color-inverse-surface": "#e0e2ec",
  "--md-sys-color-inverse-on-surface": "#2d3038",
};

/**
 * The seven per-section `--accent` / `--md-sys-color-primary*` pairs, hand
 * authored in app/globals.css `[data-section="…"]` blocks (and, for
 * "inicio", the plain `:root` default — there is no `[data-section="inicio"]`
 * block because nothing needs to override `:root` for it). This table is
 * this test's copy of that source of truth: if it ever drifts from
 * globals.css, one of the two was edited without the other.
 */
const PER_SECTION: Record<
  SectionId,
  { light: { accent: string; primaryContainer: string }; dark: { accent: string; primaryContainer: string } }
> = {
  inicio: {
    light: { accent: "#4567a8", primaryContainer: "#5a84d4" },
    dark: { accent: "#97beff", primaryContainer: "#2c4f94" },
  },
  selecao: {
    light: { accent: "#73599e", primaryContainer: "#9372c8" },
    dark: { accent: "#c8aefa", primaryContainer: "#5d408a" },
  },
  mapas: {
    light: { accent: "#006b60", primaryContainer: "#009e90" },
    dark: { accent: "#5cd5c7", primaryContainer: "#00665b" },
  },
  comparar: {
    light: { accent: "#974c72", primaryContainer: "#bf6291" },
    dark: { accent: "#f4a0c8", primaryContainer: "#81315c" },
  },
  catalogo: {
    light: { accent: "#006f92", primaryContainer: "#0095c1" },
    dark: { accent: "#65cdf3", primaryContainer: "#005e84" },
  },
  painel: {
    light: { accent: "#904529", primaryContainer: "#c66846" },
    dark: { accent: "#fba587", primaryContainer: "#873616" },
  },
  importar: {
    light: { accent: "#1d6835", primaryContainer: "#429c5a" },
    dark: { accent: "#89d298", primaryContainer: "#03642b" },
  },
};

/** `--accent-fg` is white in light, dark ink in dark — same for all seven sections. */
const ACCENT_FG = { light: "#ffffff", dark: "#14161c" };

/** sRGB hex -> relative luminance (WCAG 2.x). */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two sRGB hex colours, always >= 1. */
function contrastRatio(hexA: string, hexB: string): number {
  const lum1 = relativeLuminance(hexA);
  const lum2 = relativeLuminance(hexB);
  const lA = Math.max(lum1, lum2);
  const lB = Math.min(lum1, lum2);
  return (lA + 0.05) / (lB + 0.05);
}

describe("buildMdSysColorScheme", () => {
  it("seeds from Google's own blue, #1A73E8", () => {
    expect(M3_SEED_HEX).toBe("#1A73E8");
  });

  it("matches every non-primary role pasted into app/globals.css (light)", () => {
    const scheme = buildMdSysColorScheme(false);
    for (const [key, value] of Object.entries(LIGHT_NON_PRIMARY)) {
      expect(scheme[key]).toBe(value);
    }
  });

  it("matches every non-primary role pasted into app/globals.css (dark)", () => {
    const scheme = buildMdSysColorScheme(true);
    for (const [key, value] of Object.entries(DARK_NON_PRIMARY)) {
      expect(scheme[key]).toBe(value);
    }
  });
});

describe("per-section palette (Prisma, D-49)", () => {
  it.each(SECTIONS.map((s) => s.id))("%s has both a light and a dark accent", (id) => {
    const section = PER_SECTION[id];
    expect(section.light.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(section.dark.accent).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(SECTIONS.map((s) => s.id))(
    "%s meets WCAG AA (4.5:1) for --accent against --accent-fg, both themes",
    (id) => {
      const section = PER_SECTION[id];
      expect(contrastRatio(section.light.accent, ACCENT_FG.light)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(section.dark.accent, ACCENT_FG.dark)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("the tightest pair in the set is >= 5.58:1, per the patch's own measurement", () => {
    const ratios = SECTIONS.flatMap((s) => [
      contrastRatio(PER_SECTION[s.id].light.accent, ACCENT_FG.light),
      contrastRatio(PER_SECTION[s.id].dark.accent, ACCENT_FG.dark),
    ]);
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(5.58);
  });
});
