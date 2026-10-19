"use client";

import { useEffect, useRef } from "react";
import { takeContainerOrigin, type ContainerOrigin } from "@/lib/containerTransition";

const DURATION_MS = 350; // --m3-dur-medium3
// --m3-ease-standard. `emphasized-decelerate` here put 90 % of the growth in the first
// 70 ms (measured in a browser) and left the rest as a bare fade: a flash, not a transform.
const GROW_EASING = "cubic-bezier(0.2, 0, 0, 1)";
const FADE_START = 0.35; // the surface starts to fade while it is still growing

/**
 * Container transform, the arrival half (D-148).
 *
 * When the screen that just mounted was opened from a card, a surface the size
 * of that card grows to the content area and then fades out over the screen's own
 * fade-in (D-141), so the detail seems to come out of the card.
 *
 * The surface is a separate, empty, fixed element appended to `<body>`: it is
 * never an ancestor of the content, so no `position: fixed` descendant is
 * disturbed (the rule D-141 exists for), and it takes no pointer events. It does
 * nothing under `prefers-reduced-motion`, without `Element.animate`, or when the
 * screen was not reached from a card.
 */
export function ContainerTransition() {
  // `undefined` = not taken yet. The origin is consumed once, but React's development
  // double-run of effects (mount, cleanup, mount) would otherwise find it gone the
  // second time and draw nothing; the ref survives that re-run.
  const taken = useRef<ContainerOrigin | null | undefined>(undefined);
  useEffect(() => {
    if (taken.current === undefined) taken.current = takeContainerOrigin();
    const origin = taken.current;
    if (!origin) return;
    if (typeof document.body.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const content = document.getElementById("conteudo")?.getBoundingClientRect();
    if (!content) return;
    // The content area as the reader sees it: the page may still be scrolled (the router
    // scrolls to the top with `scroll-behavior: smooth`), so its box can start above the
    // window or run past it, and a surface that ends there would end off screen.
    const top = Math.max(content.top, 0);
    const bottom = Math.min(content.bottom, window.innerHeight);
    const target = { top, left: content.left, width: content.width, height: Math.max(bottom - top, 0) };
    if (target.height === 0) return;

    const surface = document.createElement("div");
    surface.setAttribute("aria-hidden", "true");
    surface.setAttribute("data-container-transform", "");
    Object.assign(surface.style, {
      position: "fixed",
      zIndex: "10",
      pointerEvents: "none",
      background: "rgb(var(--m3-surface-container))",
    });
    document.body.appendChild(surface);

    const box = (r: { top: number; left: number; width: number; height: number }, radius: string) => ({
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      borderRadius: radius,
    });
    // Two animations on different properties: the geometry grows over the whole duration,
    // the opacity holds, then fades out, so the two overlap instead of taking turns.
    const grow = surface.animate([box(origin, origin.radius), box(target, "0px")], {
      duration: DURATION_MS,
      easing: GROW_EASING,
      fill: "both",
    });
    const fade = surface.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: FADE_START },
        { opacity: 0, offset: 1 },
      ],
      { duration: DURATION_MS, easing: "linear", fill: "both" },
    );
    const remove = () => surface.remove();
    fade.onfinish = remove;
    fade.oncancel = remove;
    return () => {
      grow.cancel();
      fade.cancel();
      remove();
    };
  }, []);
  return null;
}
