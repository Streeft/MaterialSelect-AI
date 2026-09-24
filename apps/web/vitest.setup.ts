import "@testing-library/jest-dom/vitest";

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
 * jsdom has never implemented the Pointer Events API. MSDS's ripple and
 * shape-morph hooks listen for pointerdown/up; a minimal MouseEvent subclass
 * gives userEvent a constructor to dispatch them with (it carries
 * clientX/clientY, all the ripple reads).
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

/**
 * jsdom implements neither `Element.getAnimations()` nor `Element.scrollTo()`
 * (only `Window.scrollTo()`). md-tabs' selection-indicator animation
 * (`[ANIMATE_INDICATOR]`, tab.js) calls `this.indicator.getAnimations()`
 * before re-animating it on every tab change, and md-tabs itself calls
 * `this.tabsScrollerElement.scrollTo(...)` (tabs.js's `scrollToTab`) to keep
 * the active tab in view when the bar overflows — both cosmetic, safe to
 * no-op here the same way the `animate` polyfill above is.
 */
if (typeof Element !== "undefined" && typeof Element.prototype.getAnimations !== "function") {
  Element.prototype.getAnimations = function getAnimations() {
    return [];
  };
}
if (typeof Element !== "undefined" && typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function scrollTo() {};
}

/**
 * jsdom's HTMLDialogElement-impl.js is a bare HTMLElement subclass — it
 * reflects the `open` attribute (generated from the IDL) but implements
 * none of show()/showModal()/close(). md-dialog's own render() wires
 * @cancel/@close/@keydown on the native <dialog> it renders internally and
 * does the rest itself (redispatching to its host, animating via the
 * Element.prototype.animate polyfill above, firing its own `close`/`closed`
 * events) — it only needs the browser to let showModal()/close() run
 * without throwing, and to dispatch a cancelable `cancel` event on the
 * <dialog> when Escape is pressed while it's open, which is what a real
 * browser's native modal-dialog algorithm does for free.
 *
 * Deliberately NOT polyfilled: moving focus to the first tabbable
 * descendant on open. A real browser does that by walking the *composed*
 * (post-slotting) tree, which a jsdom-level `<dialog>` polyfill has no way
 * to replicate (`querySelector` never crosses into slotted light-DOM
 * content). md-dialog's own show() already handles this correctly without
 * that fallback: it looks for a light-DOM `[autofocus]` descendant via
 * `this.querySelector` on the *host*, which does see slotted content
 * because it queries before slot distribution — see Dialog.tsx.
 */
if (
  typeof HTMLDialogElement !== "undefined" &&
  typeof HTMLDialogElement.prototype.showModal !== "function"
) {
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement & { _msaiEscapeCancelBound?: boolean },
  ) {
    this.open = true;
    if (!this._msaiEscapeCancelBound) {
      this._msaiEscapeCancelBound = true;
      this.addEventListener("keydown", (event) => {
        if ((event as KeyboardEvent).key !== "Escape" || !this.open) return;
        this.dispatchEvent(new Event("cancel", { cancelable: true }));
      });
    }
  };
  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    returnValue?: string,
  ) {
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.open = false;
  };
}

/**
 * jsdom has never implemented IntersectionObserver. md-dialog's
 * firstUpdated() uses one purely to toggle two CSS classes (top/bottom
 * scroll dividers) as the scrollable content area is scrolled — cosmetic,
 * safe to no-op in tests.
 */
if (typeof window !== "undefined" && typeof window.IntersectionObserver === "undefined") {
  class IntersectionObserverPolyfill implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  window.IntersectionObserver =
    IntersectionObserverPolyfill as unknown as typeof IntersectionObserver;
}
