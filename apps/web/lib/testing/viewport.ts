import { afterEach, beforeEach } from "vitest";

/**
 * Answers every `min-width` media query as matching, i.e. a wide window (the
 * notebook workspace starts with its Studio open only from `xl`). Everything
 * else, the colour-scheme and reduced-motion queries included, keeps the
 * setup stub's "no".
 */
export function installWideViewport(): void {
  let original: typeof window.matchMedia;
  beforeEach(() => {
    original = window.matchMedia;
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: /\(min-width:/.test(query),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  });
  afterEach(() => {
    window.matchMedia = original;
  });
}
