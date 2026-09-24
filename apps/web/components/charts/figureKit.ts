/**
 * The small, shared machinery behind the MSDS figures (D-80).
 *
 * Everything here is *presentation*: turning a number the backend already
 * computed into a pixel, picking tick positions for an axis, measuring the box a
 * figure has to fit in, and moving keyboard focus between marks. Nothing here
 * derives a statistic, a quantile, an envelope or a normalised score — those
 * arrive ready from the API (ADR 0004), and a helper that started computing one
 * would be the second truth about the same figure that the project forbids.
 */

import { useCallback, useRef, useState, type KeyboardEvent } from "react";

/**
 * A design token as a CSS colour, **in the form this app's tokens need**.
 *
 * The tokens in `app/globals.css` are unitless `"R G B"` triples. A bare
 * `var(--edge)` is not a colour at all — as an SVG `fill` it silently falls back
 * to black, which is exactly the defect D-78 found in MSDS's own empty-state art.
 * Every colour a figure paints goes through here instead, so the wrong form
 * cannot be typed by accident.
 */
export function tok(name: `--${string}`, alpha?: number): string {
  return alpha === undefined ? `rgb(var(${name}))` : `rgb(var(${name}) / ${alpha})`;
}

/** Map a data value onto a pixel range, on a linear or a base-10 log scale. */
export function makeScale(
  domain: readonly [number, number],
  range: readonly [number, number],
  log = false,
): (value: number) => number {
  const transform = (value: number) => (log ? Math.log10(value) : value);
  const d0 = transform(domain[0]);
  const d1 = transform(domain[1]);
  const span = d1 - d0 || 1;
  return (value: number) => range[0] + ((transform(value) - d0) / span) * (range[1] - range[0]);
}

/**
 * "Nice" tick positions (1, 2 or 5 × 10ⁿ) covering `[min, max]`.
 *
 * Tick placement is a property of the drawing, not of the data — Plotly used to
 * make exactly this choice on the client, and nobody reads a tick as a
 * measurement.
 */
export function linearTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) return [min];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const raw = (hi - lo) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step =
    (normalised >= 7.5 ? 10 : normalised >= 3.5 ? 5 : normalised >= 1.5 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let value = start; value <= hi + step * 1e-9; value += step) {
    // `toPrecision` folds the float residue of repeated addition (0.30000000000000004).
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

/**
 * Tick positions for a base-10 log axis: the powers of ten inside the range,
 * with 2× and 5× added when the range spans too few decades to read.
 */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > 0) || !Number.isFinite(min) || !Number.isFinite(max)) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const inside = (value: number) => value >= lo * (1 - 1e-9) && value <= hi * (1 + 1e-9);
  const first = Math.floor(Math.log10(lo));
  const last = Math.ceil(Math.log10(hi));
  const powers: number[] = [];
  for (let exponent = first; exponent <= last; exponent += 1) {
    const value = 10 ** exponent;
    if (inside(value)) powers.push(value);
  }
  let ticks = powers;
  if (powers.length < 3) {
    const dense: number[] = [];
    for (let exponent = first; exponent <= last; exponent += 1) {
      for (const multiple of [1, 2, 5]) {
        const value = Number((multiple * 10 ** exponent).toPrecision(12));
        if (inside(value)) dense.push(value);
      }
    }
    ticks = dense;
  }
  if (ticks.length > 8) {
    const every = Math.ceil(ticks.length / 7);
    ticks = ticks.filter((_, i) => i % every === 0);
  }
  return ticks;
}

/** Shorten a label to `max` characters, with an ellipsis, for a crowded axis. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * The width a figure has to fit in, in CSS pixels, kept current by a
 * `ResizeObserver`.
 *
 * Drawing the SVG at its real width — rather than scaling a fixed `viewBox` —
 * is what keeps 12px text 12px on a phone and on a 27" screen alike. A hidden
 * figure reports 0 (the table view hides it), and a 0 is ignored so the figure
 * comes back at the size it left. Without a `ResizeObserver` (jsdom) the
 * `fallback` width is used, so the marks still exist for a test to read.
 *
 * A callback ref rather than an effect: the measurement is set from the
 * observer's own callback, never synchronously inside an effect body
 * (`react-hooks/set-state-in-effect`).
 */
export function useChartWidth(fallback = 640) {
  const [width, setWidth] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback(
    (element: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!element) return;
      if (typeof ResizeObserver === "undefined") {
        setWidth(element.clientWidth > 0 ? element.clientWidth : fallback);
        return;
      }
      const watch = new ResizeObserver((entries) => {
        const measured = entries[0]?.contentRect.width ?? 0;
        if (measured > 0) setWidth(Math.round(measured));
      });
      watch.observe(element);
      observer.current = watch;
    },
    [fallback],
  );
  return [ref, width] as const;
}

/**
 * One tab stop for a whole figure, arrows to move between its marks.
 *
 * MSDS makes every mark focusable; on a 12 × 12 comparison that is 144 tab
 * stops between the reader and the next control. A roving tab index keeps the
 * marks reachable — Tab enters the figure on the last mark read, the arrow keys
 * walk it, Home/End jump to the ends — without turning the figure into a trap.
 * `columns` makes ↑/↓ move by a row in a grid (the heatmap); without it every
 * arrow walks the marks in reading order.
 */
export function useRovingFocus(count: number, columns?: number) {
  const [active, setActive] = useState(0);
  const nodes = useRef(new Map<number, SVGElement>());
  const current = count === 0 ? -1 : Math.min(active, count - 1);

  const register = useCallback(
    (index: number) => (element: SVGElement | null) => {
      if (element) nodes.current.set(index, element);
      else nodes.current.delete(index);
    },
    [],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<SVGElement>) => {
      if (count === 0) return;
      const vertical = columns && columns > 0 ? columns : 1;
      let next: number | null = null;
      switch (event.key) {
        case "ArrowRight":
          next = current + 1;
          break;
        case "ArrowLeft":
          next = current - 1;
          break;
        case "ArrowDown":
          next = current + vertical;
          break;
        case "ArrowUp":
          next = current - vertical;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = count - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const clamped = Math.max(0, Math.min(count - 1, next));
      setActive(clamped);
      nodes.current.get(clamped)?.focus();
    },
    [count, columns, current],
  );

  return {
    /** `0` for the one mark that holds the figure's tab stop, `-1` for the rest. */
    tabIndexFor: (index: number) => (index === current ? 0 : -1),
    register,
    onKeyDown,
    /** Call from a mark's `onFocus`, so Tab comes back to where the reader left. */
    setActive,
  };
}
