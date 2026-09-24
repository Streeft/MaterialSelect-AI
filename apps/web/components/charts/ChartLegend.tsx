"use client";

import type { ReactNode } from "react";
import type { ClassSymbol } from "@/lib/design/palette";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";

const t = ptBR.chart;

/** Outline around a marker, so overlapping points stay countable (MSDS `Marker`). */
export const MARKER_OUTLINE = "rgba(0,0,0,0.25)";

/**
 * A class's marker shape, drawn in SVG at `(x, y)`.
 *
 * The shape is the half of the class encoding that survives a monochrome
 * printout and colour-vision deficiency (`lib/design/palette.ts`): colour is
 * never the only cue. The seven shapes are the seven seats of `classVisual`.
 */
export function MarkerSymbol({
  symbol,
  x,
  y,
  r,
  color,
  outline = MARKER_OUTLINE,
  strokeWidth = 1,
}: {
  symbol: ClassSymbol;
  x: number;
  y: number;
  r: number;
  color: string;
  outline?: string;
  strokeWidth?: number;
}) {
  const common = { fill: color, stroke: outline, strokeWidth };
  switch (symbol) {
    case "square":
      return <rect x={x - r * 0.8} y={y - r * 0.8} width={r * 1.6} height={r * 1.6} {...common} />;
    case "diamond":
      return (
        <rect
          x={x - r * 0.72}
          y={y - r * 0.72}
          width={r * 1.44}
          height={r * 1.44}
          transform={`rotate(45 ${x} ${y})`}
          {...common}
        />
      );
    case "triangle-up":
      return (
        <polygon
          points={`${x},${y - r} ${x + r * 0.95},${y + r * 0.8} ${x - r * 0.95},${y + r * 0.8}`}
          {...common}
        />
      );
    case "x":
      return (
        <g>
          <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
          <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        </g>
      );
    case "star": {
      const points: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? r * 1.05 : r * 0.45;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push(`${(x + radius * Math.cos(angle)).toFixed(2)},${(y + radius * Math.sin(angle)).toFixed(2)}`);
      }
      return <polygon points={points.join(" ")} {...common} />;
    }
    case "hexagon": {
      const points: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        const angle = (i * Math.PI) / 3;
        points.push(`${(x + r * Math.cos(angle)).toFixed(2)},${(y + r * Math.sin(angle)).toFixed(2)}`);
      }
      return <polygon points={points.join(" ")} {...common} />;
    }
    default:
      return <circle cx={x} cy={y} r={r} {...common} />;
  }
}

export interface LegendItem {
  key: string;
  label: ReactNode;
  /** Concrete colour or a `tok()` string — never a bare `var(--x)`. */
  color: string;
  /** Draw the class's marker shape instead of the square MSDS swatch. */
  symbol?: ClassSymbol;
  /** Draw a line swatch (index levels): solid, or dashed. */
  line?: "solid" | "dash";
  /** A hatched swatch: the written absence of D-24, never a blank square. */
  hatched?: boolean;
}

function Swatch({ item }: { item: LegendItem }) {
  if (item.symbol) {
    return (
      <svg aria-hidden width={12} height={12} viewBox="0 0 12 12" className="shrink-0" data-legend-swatch="symbol">
        <MarkerSymbol symbol={item.symbol} x={6} y={6} r={4.5} color={item.color} />
      </svg>
    );
  }
  if (item.line) {
    return (
      <svg aria-hidden width={18} height={10} viewBox="0 0 18 10" className="shrink-0" data-legend-swatch="line">
        <line
          x1={1}
          y1={5}
          x2={17}
          y2={5}
          stroke={item.color}
          strokeWidth={2}
          strokeDasharray={item.line === "dash" ? "4 3" : undefined}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (item.hatched) {
    return <span aria-hidden className="msds-legend-swatch chart-hatch-swatch" data-legend-swatch="hatch" />;
  }
  return (
    <span
      aria-hidden
      className="msds-legend-swatch"
      data-legend-swatch="square"
      style={{ background: item.color }}
    />
  );
}

/**
 * The MSDS legend: one button per series, and clicking one shows or hides it.
 *
 * `aria-pressed` is "this series is drawn", so the state is announced and not
 * only struck through. A legend without `onToggle` is a plain list — some
 * figures name their parts but have nothing to hide (the heatmap's scale).
 * `onHover` lets a figure highlight the series under the pointer, which is how
 * two materials of the same class — same hue, same shape — are told apart on
 * the radar and the parallel coordinates.
 */
export function ChartLegend({
  items,
  hidden,
  onToggle,
  onHover,
  className,
}: {
  items: LegendItem[];
  hidden?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
  onHover?: (key: string | null) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  if (!onToggle) {
    return (
      <ul className={cn("msds-legend m-0 list-none p-0", className)} aria-label={t.legend}>
        {items.map((item) => (
          <li key={item.key} className="msds-legend-item cursor-default">
            <Swatch item={item} />
            <span data-legend-label>{item.label}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div role="group" aria-label={t.legendToggle} className={cn("msds-legend", className)}>
      {items.map((item) => {
        const off = hidden?.has(item.key) ?? false;
        return (
          <button
            key={item.key}
            type="button"
            className="msds-legend-item"
            data-off={off ? "true" : "false"}
            aria-pressed={!off}
            onClick={() => onToggle(item.key)}
            onMouseEnter={onHover ? () => onHover(item.key) : undefined}
            onMouseLeave={onHover ? () => onHover(null) : undefined}
            onFocus={onHover ? () => onHover(item.key) : undefined}
            onBlur={onHover ? () => onHover(null) : undefined}
          >
            <Swatch item={item} />
            <span data-legend-label>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The line under a figure that reads the mark under the pointer or the focus.
 *
 * MSDS's `BarChart` hover line. `aria-hidden` on purpose: the focused mark
 * already announces its own `aria-label`, and a live region on top of it would
 * read every value twice. When nothing is active it says how to read the
 * figure, rather than holding an empty 18px strip.
 */
export function ChartInfoLine({ children }: { children: ReactNode | null }) {
  return (
    <div aria-hidden className="chart-info-line" data-empty={children ? "false" : "true"}>
      {children ?? t.interactHint}
    </div>
  );
}
