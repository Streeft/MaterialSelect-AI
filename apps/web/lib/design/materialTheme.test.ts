import { describe, expect, it } from "vitest";

import { buildMdSysColorScheme, M3_SEED_HEX } from "./materialTheme";

/**
 * Locks the generator's output against the literal hex values pasted into
 * app/globals.css. If this test ever fails, the seed or the algorithm
 * changed — update globals.css to match (regenerate with this same
 * function) rather than editing the values below to make it pass.
 */

const LIGHT: Record<string, string> = {
  "--md-sys-color-primary": "#005bbf",
  "--md-sys-color-on-primary": "#ffffff",
  "--md-sys-color-primary-container": "#1a73e8",
  "--md-sys-color-on-primary-container": "#ffffff",
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

const DARK: Record<string, string> = {
  "--md-sys-color-primary": "#adc7ff",
  "--md-sys-color-on-primary": "#002e68",
  "--md-sys-color-primary-container": "#1a73e8",
  "--md-sys-color-on-primary-container": "#ffffff",
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

describe("buildMdSysColorScheme", () => {
  it("seeds from Google's own blue, #1A73E8", () => {
    expect(M3_SEED_HEX).toBe("#1A73E8");
  });

  it("keeps the seed itself as light.primaryContainer (Content variant, not TonalSpot)", () => {
    // TonalSpot (the Android system default) desaturates primary to a
    // washed-out blue-grey instead of Google's actual product blue — the
    // Content variant is the one that preserves the seed's own chroma.
    expect(buildMdSysColorScheme(false)["--md-sys-color-primary-container"]).toBe("#1a73e8");
  });

  it("matches the light scheme pasted into app/globals.css", () => {
    expect(buildMdSysColorScheme(false)).toEqual(LIGHT);
  });

  it("matches the dark scheme pasted into app/globals.css", () => {
    expect(buildMdSysColorScheme(true)).toEqual(DARK);
  });
});
