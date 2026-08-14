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

/**
 * jsdom has never implemented the Pointer Events API. @material/web's ripple
 * (mounted inside every button-family shadow root) checks
 * `event instanceof PointerEvent` on click to decide whether to start the
 * animation from the pointer position — with the identifier missing
 * entirely, that check throws a bare `ReferenceError` instead of just
 * evaluating false, which is all a userEvent.click()-dispatched MouseEvent
 * would ever produce here anyway (jsdom doesn't synthesize real
 * PointerEvents). A minimal MouseEvent subclass is enough to make the
 * identifier exist; nothing in the ripple's fallback path needs more.
 */
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {}
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

/**
 * jsdom has never implemented the Web Animations API either. The same ripple
 * calls `this.mdRoot.animate(...)` to grow the press effect, then reads
 * `.currentTime` and calls `.cancel()` on what it returns. Reporting a
 * `currentTime` at least as large as the ripple's own MINIMUM_PRESS_MS (225)
 * takes the "still growing" branch out of play, so a click resolves
 * immediately instead of a real 225ms `setTimeout` per test.
 */
if (typeof Element !== "undefined" && typeof Element.prototype.animate !== "function") {
  Element.prototype.animate = function animate() {
    return {
      cancel: () => {},
      finish: () => {},
      pause: () => {},
      play: () => {},
      currentTime: 225,
      finished: Promise.resolve(),
      onfinish: null,
    } as unknown as Animation;
  };
}
