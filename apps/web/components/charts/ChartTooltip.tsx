"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ClassSymbol } from "@/lib/design/palette";
import { MarkerSymbol } from "./ChartLegend";

/** One line of the readout: a key (marker), what it is, and its value. */
export interface TooltipRow {
  key: string;
  label: ReactNode;
  /** The number, already formatted by the caller (pt-BR, D-30) — or a written absence. */
  value: ReactNode;
  /** A `tok()` string or a concrete colour. Without it the row has no marker. */
  color?: string;
  /** The series' shape — the half of its identity that survives CVD and print. */
  symbol?: ClassSymbol;
  /** A line key (index levels, parallel coordinates) instead of a marker. */
  line?: boolean;
  /** The row the pointer is actually on, when the readout lists every series. */
  emphasis?: boolean;
}

/** What a figure hands its tooltip: a heading and the rows under it. */
export interface TooltipContent {
  title: ReactNode;
  rows: TooltipRow[];
  /** A quieter line under the rows — a caveat, an absence explained. */
  note?: ReactNode;
}

function isContent(value: unknown): value is TooltipContent {
  return typeof value === "object" && value !== null && "rows" in value && "title" in value;
}

const GAP = 14;

/**
 * Shapes for series that are not material classes (quality states, segments),
 * in a fixed order — the same seats `classVisual` uses, so a legend and a
 * tooltip key a series by shape as well as by colour (D-28).
 */
export const SERIES_SYMBOLS: readonly ClassSymbol[] = [
  "circle",
  "square",
  "diamond",
  "triangle-up",
  "hexagon",
  "star",
];

/**
 * The floating readout of a figure (D-95) — the Google AI Studio tooltip,
 * in this app's own panel colours: a panel beside the pointer, the category
 * on top, then one row per series with its marker, its name and its value.
 *
 * It follows whatever is active in the figure: the pointer when a mouse is on
 * it, the focused mark when a keyboard walks it (the roving tab index), so the
 * same details reach both. It places itself: it reads the pointer (or the
 * focused mark's box) from its own positioning parent, sits below-right of it,
 * and flips to the other side before it would leave the figure.
 *
 * `aria-hidden` on purpose: every mark already announces its own
 * `aria-label`, and the table view carries every number (D-31) — the tooltip
 * enhances, it never gates.
 */
export function ChartTooltip({ content }: { content: TooltipContent | ReactNode | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  // Listen on the figure's own box: the parent is the positioning container,
  // and the anchor is expressed in its coordinates.
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const onMove = (event: PointerEvent) => {
      const box = host.getBoundingClientRect();
      setAnchor({ x: event.clientX - box.left, y: event.clientY - box.top });
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Element | null;
      if (!target || target === host || !(target instanceof Element)) return;
      const box = host.getBoundingClientRect();
      const mark = target.getBoundingClientRect();
      setAnchor({ x: mark.right - box.left, y: mark.top - box.top + mark.height / 2 });
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("focusin", onFocus);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("focusin", onFocus);
    };
  }, []);

  // Place after layout, from the panel's real size — written to the style
  // directly, so a pointer move costs one render, not two.
  useLayoutEffect(() => {
    const panel = ref.current;
    const host = panel?.parentElement;
    if (!panel || !host || !anchor || !content) return;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    let left = anchor.x + GAP;
    if (left + width > host.clientWidth - 4) left = anchor.x - GAP - width;
    let top = anchor.y + GAP;
    if (top + height > host.clientHeight - 4) top = anchor.y - GAP - height;
    panel.style.left = `${Math.max(0, left)}px`;
    panel.style.top = `${Math.max(0, top)}px`;
  }, [anchor, content]);

  const visible = Boolean(content) && anchor !== null;

  return (
    <div
      ref={ref}
      aria-hidden
      className="chart-tooltip"
      data-visible={visible ? "true" : "false"}
    >
      {!content ? null : isContent(content) ? (
        <>
          <div className="chart-tooltip-title">{content.title}</div>
          {content.rows.map((row) => (
            <div key={row.key} className="chart-tooltip-row" data-emphasis={row.emphasis ? "true" : "false"}>
              <span className="chart-tooltip-key">
                {row.color ? (
                  row.line ? (
                    <svg width={12} height={12} viewBox="0 0 12 12">
                      <line x1={1} y1={6} x2={11} y2={6} stroke={row.color} strokeWidth={2.5} strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width={12} height={12} viewBox="0 0 12 12">
                      <MarkerSymbol
                        symbol={row.symbol ?? "circle"}
                        x={6}
                        y={6}
                        r={4.4}
                        color={row.color}
                        outline="rgb(var(--surface-panel))"
                      />
                    </svg>
                  )
                ) : null}
              </span>
              <span className="chart-tooltip-label">{row.label}</span>
              <span className="chart-tooltip-value">{row.value}</span>
            </div>
          ))}
          {content.note ? <div className="chart-tooltip-note">{content.note}</div> : null}
        </>
      ) : (
        <div className="chart-tooltip-text">{content}</div>
      )}
    </div>
  );
}
