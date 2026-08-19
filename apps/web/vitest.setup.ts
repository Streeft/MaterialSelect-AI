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
 * `md-radio`'s validator (`RadioValidator.computeValidity`) only ever sets
 * `valueMissing` and leaves every other `ValidityStateFlags` key (`badInput`,
 * `typeMismatch`, ...) as `undefined` — a real browser's `setValidity`
 * treats "not `true`" as valid, so that is harmless. This polyfill's
 * `isValid()` is stricter: it requires each key to be `=== false`, so an
 * `undefined` flag reads as invalid — and then `setValidity` demands a
 * non-empty message for an "invalid" state MWC believes is valid, throwing
 * on the very first `<md-radio>` constructed. Normalizing nullish flags to
 * `false` before delegating restores the spec's actual rule.
 */
if (typeof ElementInternals !== "undefined") {
  const originalSetValidity = ElementInternals.prototype.setValidity;
  ElementInternals.prototype.setValidity = function setValidity(
    flags?: ValidityStateFlags,
    message?: string,
    anchor?: HTMLElement,
  ) {
    const normalized = flags
      ? (Object.fromEntries(
          Object.entries(flags).map(([key, value]) => [key, value ?? false]),
        ) as ValidityStateFlags)
      : flags;
    return originalSetValidity.call(this, normalized, message, anchor);
  };
}

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
 * `element-internals-polyfill`'s deferred "flush once connected" mechanism
 * (`aom.js`) only works if its own `MutationObserver` (`subtree: true` on
 * `document.documentElement`) sees the element itself listed in some
 * mutation record's `addedNodes`. React never inserts one node at a time —
 * it builds an entire subtree off-DOM (in a detached fragment) and attaches
 * it with a single `appendChild`, so only the outermost inserted ancestor
 * shows up in `addedNodes`; a `<md-radio>` nested inside `<fieldset><div>`
 * is never individually reported. Any `ElementInternals` property MWC sets
 * in a constructor — before the element is connected — such as `this[
 * internals].role = 'radio'` (`radio.js`) — is queued for that flush and
 * then never gets applied, so the host is left with no `role` attribute at
 * all. Confirmed by instrumenting the polyfill directly: the AOM setter's
 * `upgradeMap.set(ref, internals)` branch fires (`isConnected` is false in
 * the constructor), but the observer's `addedNodes` for a React-inserted
 * subtree never includes the nested node, so it's never drained. In a real
 * browser this whole file doesn't exist — `role` reflects immediately,
 * natively — so this is a jsdom/polyfill-only gap, not a production bug.
 *
 * Fix: wrap `attachInternals()` (already patched above for `setValidity`)
 * to remember the returned `internals` per element, then on a microtask —
 * by which point React's synchronous commit (DOM mutation + ref callback +
 * layout effects) has finished and the element is connected — re-run the
 * setter for every AOM-reflected property with its own current value. That
 * re-entry sees `isConnected === true` and takes the polyfill's direct
 * `setAttribute` branch instead of queuing again. The key list is copied
 * from `element-internals-polyfill/dist/aom.js`, which isn't part of the
 * package's public API.
 */
const ARIA_OBJECT_MODEL_PROPERTIES = [
  "role",
  "ariaAtomic",
  "ariaAutoComplete",
  "ariaBrailleLabel",
  "ariaBrailleRoleDescription",
  "ariaBusy",
  "ariaChecked",
  "ariaColCount",
  "ariaColIndex",
  "ariaColIndexText",
  "ariaColSpan",
  "ariaCurrent",
  "ariaDescription",
  "ariaDisabled",
  "ariaExpanded",
  "ariaHasPopup",
  "ariaHidden",
  "ariaInvalid",
  "ariaKeyShortcuts",
  "ariaLabel",
  "ariaLevel",
  "ariaLive",
  "ariaModal",
  "ariaMultiLine",
  "ariaMultiSelectable",
  "ariaOrientation",
  "ariaPlaceholder",
  "ariaPosInSet",
  "ariaPressed",
  "ariaReadOnly",
  "ariaRelevant",
  "ariaRequired",
  "ariaRoleDescription",
  "ariaRowCount",
  "ariaRowIndex",
  "ariaRowIndexText",
  "ariaRowSpan",
  "ariaSelected",
  "ariaSetSize",
  "ariaSort",
  "ariaValueMax",
  "ariaValueMin",
  "ariaValueNow",
  "ariaValueText",
] as const;

if (typeof HTMLElement !== "undefined") {
  const originalAttachInternals = HTMLElement.prototype.attachInternals;
  // `@lit-labs/ssr-dom-shim` locally exports its own, structurally narrower
  // `ElementInternals` type (`ariaAtomic: string`, not `string | null`) under
  // the same name as the global one — TS then sees the override's inferred
  // return type and the prototype's declared return type as two
  // incompatible types that both happen to print as "ElementInternals".
  // Casting the whole replacement function through `unknown` sidesteps
  // comparing call signatures one property at a time.
  const attachInternalsOverride = function attachInternals(this: HTMLElement, ...args: []) {
    const internals = originalAttachInternals.apply(this, args);
    const indexable = internals as unknown as Record<string, unknown>;
    if (!this.isConnected) {
      const element = this;
      queueMicrotask(() => {
        if (!element.isConnected) {
          return;
        }
        for (const key of ARIA_OBJECT_MODEL_PROPERTIES) {
          try {
            // Only re-trigger keys the element actually set. `setAttribute`
            // has no null-guard of its own (DOM coerces `null` to the
            // literal string "null"), so re-writing an untouched key would
            // stamp a bogus `role="null"`/`aria-checked="null"` onto
            // elements that never asked for one — the same guard the
            // polyfill's own flush uses (`aom.js`'s `.filter(key =>
            // internals[key] !== null)`).
            if (indexable[key] !== null) {
              indexable[key] = indexable[key];
            }
          } catch {
            // Not every element defines every AOM property; skip silently.
          }
        }
      });
    }
    return internals;
  };
  HTMLElement.prototype.attachInternals = attachInternalsOverride as unknown as typeof originalAttachInternals;
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
