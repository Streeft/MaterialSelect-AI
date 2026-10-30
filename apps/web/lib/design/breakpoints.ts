/**
 * The five Material 3 breakpoints (D-182; m3.material.io › Foundations › Layout ›
 * Breakpoints, read 29/10/26). Widths in CSS px, which the M3 page gives in dp.
 *
 * A breakpoint says how many panes fit, not which device is in hand: a desktop
 * window dragged narrow is "compact" and must get the one-pane layout.
 */
export const WINDOW_CLASSES = ["compact", "medium", "expanded", "large", "extraLarge"] as const;

export type WindowClass = (typeof WINDOW_CLASSES)[number];

/** Lower bound of each class; each class runs up to the next one's bound. */
export const BREAKPOINT_MIN: Record<WindowClass, number> = {
  compact: 0,
  medium: 600,
  expanded: 840,
  large: 1200,
  extraLarge: 1600,
};

export function windowClassFor(width: number): WindowClass {
  let found: WindowClass = "compact";
  for (const name of WINDOW_CLASSES) {
    if (width >= BREAKPOINT_MIN[name]) found = name;
  }
  return found;
}

/** `true` when `current` is `target` or wider. */
export function atLeast(current: WindowClass, target: WindowClass): boolean {
  return WINDOW_CLASSES.indexOf(current) >= WINDOW_CLASSES.indexOf(target);
}

/** The `min-width` media query that starts a class. */
export function mediaQueryFor(name: WindowClass): string {
  return `(min-width: ${BREAKPOINT_MIN[name]}px)`;
}
