/**
 * Generator for the Material 3 `--md-sys-color-*` scheme consumed by
 * @material/web's shadow DOM (button, text-field, card, dialog, tabs, ...).
 * Seed is Google's own blue, #1A73E8 — chosen over the project's existing
 * brand ramp (D-38) per explicit user decision when adopting M3.
 *
 * This module is a build/test-time tool, not a runtime dependency: the two
 * schemes it computes are static (fixed seed, fixed light/dark split), so
 * their hex output is pasted once into app/globals.css — the single place
 * every other token in this app already lives — rather than recomputed on
 * every page load. Recomputing here and pasting there is what
 * materialTheme.test.ts locks: if the seed or the algorithm ever changes,
 * the test fails until globals.css is updated to match.
 *
 * Deliberately NOT used for --brand-*, --success/--warning/--danger/--info,
 * or --quality-* (see materialTheme.test.ts for why: SchemeTonalSpot derives
 * every custom color's tone from CorePalette.of(seedHue), and for a
 * desaturated input like --quality-ausente's neutral gray that produces a
 * spurious saturated hue instead of preserving the source — for that token
 * specifically, a hue divorced from gray. Those eight tokens keep their
 * hand-measured, WCAG-audited values, independent of this generator).
 */

import {
  Hct,
  SchemeContent,
  argbFromHex,
  hexFromArgb,
} from "@material/material-color-utilities";

export const M3_SEED_HEX = "#1A73E8";

const MD_SYS_COLOR_ROLES = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "primaryFixed",
  "primaryFixedDim",
  "onPrimaryFixed",
  "onPrimaryFixedVariant",
  "inversePrimary",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "secondaryFixed",
  "secondaryFixedDim",
  "onSecondaryFixed",
  "onSecondaryFixedVariant",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "tertiaryFixed",
  "tertiaryFixedDim",
  "onTertiaryFixed",
  "onTertiaryFixedVariant",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "background",
  "onBackground",
  "surface",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "surfaceTint",
  "outline",
  "outlineVariant",
  "shadow",
  "scrim",
  "inverseSurface",
  "inverseOnSurface",
] as const;

export type MdSysColorRole = (typeof MD_SYS_COLOR_ROLES)[number];

/** camelCase getter name -> kebab-case CSS custom property suffix. */
function cssTokenName(role: string): string {
  return `--md-sys-color-${role.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

/**
 * "Content" is the M3 variant that places the source color, unaltered, in
 * `primaryContainer` — verified empirically: light.primaryContainer comes
 * back exactly #1a73e8, the seed itself. The default "TonalSpot" variant
 * (Android's system default) desaturates primary to a washed-out blue-grey
 * instead (#495f8b in this seed) — the opposite of what "adopt Google's own
 * blue" asked for. Standard contrast, current (2025) spec — the superset of
 * roles that includes surface-container-*, which @material/web's stable
 * button/card/text-field/dialog styles all reference.
 */
export function buildMdSysColorScheme(isDark: boolean): Record<string, string> {
  const scheme = new SchemeContent(
    Hct.fromInt(argbFromHex(M3_SEED_HEX)),
    isDark,
    0,
    "2025",
  );
  const out: Record<string, string> = {};
  for (const role of MD_SYS_COLOR_ROLES) {
    out[cssTokenName(role)] = hexFromArgb(scheme[role]);
  }
  return out;
}
