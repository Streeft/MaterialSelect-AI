"use client";

import { useEffect, useRef } from "react";

/**
 * D-190: the box sets a Plotly figure's size, never the layout.
 *
 * Two rules every Plotly chart in the app follows, kept here so they cannot
 * drift apart again:
 *
 * 1. **Height lives in CSS** (`PLOTLY_HEIGHT` below, or a viewport clamp), and
 *    `layout.height` stays undefined. `Plotly.Plots.resize` — which
 *    `react-plotly.js` calls on mount and on every window resize — runs
 *    `delete gd.layout.height` on the very object we memoised. The next
 *    `Plotly.react` with that object (and `responsive: true`) then writes
 *    `height: 100%` on `.svg-container`; inside a wrapper with no height that is
 *    0 px, and the 540 px SVG spills over whatever comes after the chart. That is
 *    the "distorted map" of the Nível 2 switch: every URL change re-rendered the
 *    traces with the mutated layout. A wrapper with a height makes 100% right.
 * 2. **The box is watched, not the window.** Plotly's own handler listens to
 *    `window.resize` only; a panel that opens, a sidebar that collapses or a
 *    grid that reflows changes the box without resizing the window. A
 *    `ResizeObserver` on the wrapper asks Plotly to measure again.
 */
export function usePlotlyResize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    let last = { width: box.clientWidth, height: box.clientHeight };
    const observer = new ResizeObserver(() => {
      const next = { width: box.clientWidth, height: box.clientHeight };
      if (next.width === last.width && next.height === last.height) return;
      last = next;
      const graph = box.querySelector<HTMLElement>(".js-plotly-plot");
      // Hidden (the "Tabela" view) or not drawn yet: nothing to measure.
      if (!graph || next.width === 0 || next.height === 0) return;
      void import("@/lib/plotly-custom")
        .then(({ default: plotly }) => plotly.Plots.resize(graph))
        .catch(() => {
          // A figure hidden between the observation and the call rejects;
          // the next visible size change measures it again.
        });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/** The fixed heights of the embedded figures, as Tailwind classes on the wrapper. */
export const PLOTLY_HEIGHT = {
  map: "h-[540px]",
  ragone: "h-[480px]",
  property: "h-[380px]",
} as const;
