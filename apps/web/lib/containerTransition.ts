import type { MouseEvent } from "react";

/**
 * Container transform, the origin half (D-148, after M3 "Motion → Transitions → Container transform").
 *
 * A card that opens a detail screen leaves its rectangle here when it is clicked;
 * `ContainerTransition` takes it on the next screen and grows a surface from it.
 * Module state, not storage: the navigation is a client-side one inside the same
 * page, and a reload or a link opened in another tab must not animate from a
 * rectangle that is no longer on screen.
 */

export interface ContainerOrigin {
  top: number;
  left: number;
  width: number;
  height: number;
  /** The card's computed `border-radius`, so the surface starts with the same corners. */
  radius: string;
  at: number;
}

/** A click that never became a navigation must not animate the next, unrelated one. */
export const ORIGIN_MAX_AGE_MS = 1500;

/** Marks the card a click came from: the closest ancestor with `data-container-origin`. */
export const ORIGIN_ATTRIBUTE = "data-container-origin";

let pending: ContainerOrigin | null = null;

export function setContainerOrigin(origin: ContainerOrigin | null): void {
  pending = origin;
}

/** Returns the origin once, and only while it is fresh. */
export function takeContainerOrigin(now: number = Date.now()): ContainerOrigin | null {
  const origin = pending;
  pending = null;
  return origin && now - origin.at <= ORIGIN_MAX_AGE_MS ? origin : null;
}

/**
 * `onClick` for the link inside a card. Ignores what does not navigate in place:
 * a modified click (new tab or window) and any button but the primary one.
 */
export function markContainerOrigin(event: MouseEvent<HTMLElement>): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const card = event.currentTarget.closest(`[${ORIGIN_ATTRIBUTE}]`);
  if (!card) return;
  const rect = card.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  setContainerOrigin({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    radius: getComputedStyle(card).borderRadius || "0px",
    at: Date.now(),
  });
}
