"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/cn";

/**
 * D-248: the active indicator of the navigation rail, the drawer, the bottom
 * bar and the tabs (M3 Expressive). One surface per container that travels
 * from the old destination to the new one and stretches on the way: the edge
 * in front moves on the fast spatial spring and the edge behind on the slow
 * one, so the pill grows towards where it goes and catches up.
 *
 * What is measured here is the place of a DOM element, for a decoration — not
 * a quantity of the data (ADR 0004 is about the figures). The hook writes four
 * offsets on the container (`--ind-l/r/t/b`, from its padding box, so the
 * surface scrolls with the list) and `data-ind`:
 *
 * - absent or `off`: no surface; each item keeps its own static mark (the
 *   server render, or no active item in the container);
 * - `ready`: placed for the first time, without moving;
 * - `on`: placed, and the next change animates (`data-ind-dir` says which
 *   edge leads).
 *
 * The element under the surface gets `data-ind-target`, so CSS can drop its
 * own mark only where the surface stands. Nothing moves under reduced motion:
 * the global rule ends every transition at once.
 */

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useSlidingIndicator(
  ref: RefObject<HTMLElement | null>,
  selector: string,
  key: unknown,
  axis: "x" | "y" = "x",
) {
  const lastStart = useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    let frame = 0;

    const place = () => {
      const matches = Array.from(box.querySelectorAll<HTMLElement>(selector));
      // The last match: in the rail a pinned copy of the page comes before its
      // place in the group, and the group is where the reader looks for it.
      const target = matches.reverse().find((el) => el.getClientRects().length > 0);
      box.querySelectorAll("[data-ind-target]").forEach((el) => {
        if (el !== target) el.removeAttribute("data-ind-target");
      });
      if (!target) {
        box.dataset.ind = "off";
        lastStart.current = null;
        return;
      }
      const outer = box.getBoundingClientRect();
      const inner = target.getBoundingClientRect();
      const left = inner.left - outer.left - box.clientLeft + box.scrollLeft;
      const top = inner.top - outer.top - box.clientTop + box.scrollTop;
      const start = axis === "x" ? left : top;
      const previous = lastStart.current;
      lastStart.current = start;
      box.dataset.indDir = previous === null || start >= previous ? "fwd" : "back";
      box.style.setProperty("--ind-l", `${left}px`);
      box.style.setProperty("--ind-t", `${top}px`);
      box.style.setProperty("--ind-r", `${box.clientWidth - left - inner.width}px`);
      box.style.setProperty("--ind-b", `${box.clientHeight - top - inner.height}px`);
      target.setAttribute("data-ind-target", "");
      if (box.dataset.ind !== "on") {
        // First placement: show it where it is, and only animate from the next one.
        box.dataset.ind = "ready";
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (box.dataset.ind === "ready") box.dataset.ind = "on";
        });
      }
    };

    place();
    // A group that folds, the rail that collapses, a section that arrives with
    // its data or a label that wraps moves the target without changing `key`.
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place());
    const observeChildren = () => Array.from(box.children).forEach((child) => resize?.observe(child));
    resize?.observe(box);
    observeChildren();
    const mutation =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observeChildren();
            place();
          });
    mutation?.observe(box, { childList: true, subtree: true });
    return () => {
      resize?.disconnect();
      mutation?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, selector, key, axis]);
}

/** The travelling surface. Decorative: the active item says `aria-current` itself. */
export function SlidingIndicator({ className }: { className?: string }) {
  return <span aria-hidden className={cn("m3-ind", className)} />;
}
