/**
 * Scrolling while something is dragged near the edge of what it is dragged in (D-249).
 *
 * A drag that cannot reach a drop target below the fold is no drag at all: on a long class tree the
 * target is often off screen, and on a phone `touch-action: none` on the grip means the finger
 * cannot scroll the page by itself. So the page moves for it. The rule is pure (a point and the
 * edges of the scrolling area give a speed), so it is tested without a browser.
 */

/** Pixels from an edge inside which the area starts to scroll. */
export const EDGE_ZONE = 72;
/** The fastest scroll, in pixels per frame (about 1200 px/s at 60 fps). */
export const EDGE_MAX_SPEED = 20;

/**
 * How far to scroll this frame: negative up, positive down, zero in the middle. Speed grows with
 * how close the pointer is to the edge and is full beyond it (a finger dragged past the edge of the
 * screen keeps scrolling at the top speed). A short area never has a dead middle: the zones shrink
 * to half of it.
 */
export function edgeScrollDelta(
  pointer: number,
  start: number,
  end: number,
  zone = EDGE_ZONE,
  maxSpeed = EDGE_MAX_SPEED,
): number {
  const size = end - start;
  if (!(size > 0)) return 0;
  const reach = Math.min(zone, size / 2);
  const fromStart = pointer - start;
  const fromEnd = end - pointer;
  if (fromStart < reach) {
    const depth = Math.min(1, (reach - fromStart) / reach);
    return -Math.max(1, Math.round(maxSpeed * depth * depth));
  }
  if (fromEnd < reach) {
    const depth = Math.min(1, (reach - fromEnd) / reach);
    return Math.max(1, Math.round(maxSpeed * depth * depth));
  }
  return 0;
}

/** The nearest ancestor that scrolls vertically, or `null` when the page itself is the scroller. */
export function scrollParent(element: Element | null): HTMLElement | null {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) return null;
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

/** The vertical span of the area that scrolls, cut to what is on screen: `[top, bottom]` in px. */
export function scrollSpan(scroller: HTMLElement | null): [number, number] {
  const viewport = window.innerHeight;
  if (!scroller) return [0, viewport];
  const box = scroller.getBoundingClientRect();
  return [Math.max(0, box.top), Math.min(viewport, box.bottom)];
}
