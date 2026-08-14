import "@testing-library/jest-dom/vitest";

/**
 * jsdom's `ElementInternals` only implements the ARIA-reflection half of the
 * spec (no `setFormValue`/`setValidity`/`checkValidity`/...) — every
 * form-associated @material/web element (button, checkbox, radio, select,
 * text-field) throws on construction without this. The package's own
 * feature-detection (instantiate + probe, not a bare `typeof` check)
 * correctly identifies jsdom's implementation as incomplete and patches it.
 */
import "element-internals-polyfill";

/**
 * jsdom ships no media-query engine, so `window.matchMedia` is simply absent
 * and anything that asks the OS about the colour scheme throws on mount.
 *
 * The stub answers "not dark", which is the light theme — the same default the
 * bootstrap script falls back to when storage is unreadable. Tests that care
 * about the dark theme override `matches` themselves; nothing here fakes a
 * media query actually matching.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
