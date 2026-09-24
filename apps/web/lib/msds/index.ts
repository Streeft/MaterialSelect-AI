/**
 * MSDS — barrel export.
 *
 * Ported from the Artifact-built design system (see docs/DECISIONS.md D-74).
 * `./msds.tsx` and `./icons.tsx` are a straight module-wiring port of
 * `components/bundle.js` / its `Icon(name)` function and carry `@ts-nocheck`
 * for that reason (see the header comment in each file). This barrel is the
 * one place application code should import from.
 *
 * `./msds.css` is imported once, from `app/layout.tsx`, not re-exported here
 * (a CSS import belongs at the app entry point, not inside a JS barrel).
 */
export * from "./msds";
export { msdsIcon } from "./icons";
