"use client";

import { useEffect, useRef } from "react";
import { takeContainerOrigin, type ContainerOrigin } from "@/lib/containerTransition";

const DURATION_MS = 350; // --m3-dur-medium3
const EASING = "cubic-bezier(0.05, 0.7, 0.1, 1)"; // --m3-ease-emphasized-decelerate

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
    const target = document.getElementById("conteudo")?.getBoundingClientRect();
    if (!target) return;

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

    const box = (r: { top: number; left: number; width: number; height: number }, radius: string, opacity: number) => ({
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      borderRadius: radius,
      opacity,
    });
    const animation = surface.animate(
      [
        { ...box(origin, origin.radius, 1), offset: 0 },
        { ...box(target, "0px", 1), offset: 0.6 },
        { ...box(target, "0px", 0), offset: 1 },
      ],
      { duration: DURATION_MS, easing: EASING, fill: "both" },
    );
    const remove = () => surface.remove();
    animation.onfinish = remove;
    animation.oncancel = remove;
    return () => {
      animation.cancel();
      remove();
    };
  }, []);
  return null;
}
