import { useState } from "react";
import type { ClassSymbol } from "@/lib/design/palette";
import { ptBR } from "@/lib/i18n";
import { formatScore } from "@/lib/format";
import type { LegendItem } from "./ChartLegend";
import type { TooltipContent } from "./ChartTooltip";
import { TOOLTIP_ROWS } from "./comparisonDensity";

const tc = ptBR.chart;

/** One compared material, as every comparison figure draws it. */
export interface CompareSeries {
  id: number;
  name: string;
  className: string;
  color: string;
  symbol: ClassSymbol;
  complete: boolean;
}

/** One compared property: a short label for a crowded axis, the full name for words. */
export interface CompareAxisView {
  slug: string;
  label: string;
  name: string;
  /** How many compared materials have no value here — counted by the API. */
  missing: number;
}

/**
 * The backend's normalised score (0–1, 1 = best among the compared), or `null`
 * when the material has no value — a gap, never a zero (D-24).
 */
export type ScoreOf = (seriesId: number, slug: string) => number | null;

export interface FigureProps {
  figureLabel: string;
  series: CompareSeries[];
  axes: CompareAxisView[];
  score: ScoreOf;
}

export const absent = ptBR.quality.AUSENTE;

export const NORMALISED_TICKS = [0, 0.25, 0.5, 0.75, 1];

export function legendItems(series: CompareSeries[]): LegendItem[] {
  return series.map((s) => ({ key: String(s.id), label: s.name, color: s.color, symbol: s.symbol }));
}

/** The legend's show/hide state, shared by every comparison figure. */
export function useHiddenSeries() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  /** Hide every one of `series` (`true`) or show them all (`false`) — D-187, for a legend of hundreds. */
  const setAll = (hide: boolean, series: readonly CompareSeries[]) =>
    setHidden(hide ? new Set(series.map((s) => String(s.id))) : new Set());
  return { hidden, toggle, setAll };
}

export function scoreWords(series: CompareSeries, axis: CompareAxisView, value: number | null) {
  const shown = value === null ? absent : formatScore(value);
  return { aria: `${series.name} (${series.className}) — ${axis.name}: ${shown}` };
}

/**
 * The shared readout of one property (D-95, the AI Studio tooltip): the
 * property on top, then every drawn material's normalised score on it, the
 * one under the pointer emphasised. A material with no value says so in words
 * (D-24) — never a zero.
 *
 * D-187: past `TOOLTIP_ROWS` materials the list would be taller than the
 * screen, so it carries only the one under the pointer.
 */
export function scoreTip(
  axis: CompareAxisView,
  drawn: CompareSeries[],
  activeId: number,
  score: ScoreOf,
): TooltipContent {
  const rows = drawn.length > TOOLTIP_ROWS ? drawn.filter((s) => s.id === activeId) : drawn;
  return {
    title: axis.name,
    rows: rows.map((s) => {
      const value = score(s.id, axis.slug);
      return {
        key: String(s.id),
        label: s.name,
        value: value === null ? absent : formatScore(value),
        color: s.color,
        symbol: s.symbol,
        emphasis: s.id === activeId,
      };
    }),
    note: tc.normalizedNote,
  };
}

/** One material's readout across every property — what a hovered line says (D-187). */
export function seriesTip(series: CompareSeries, axes: CompareAxisView[], score: ScoreOf): TooltipContent {
  return {
    title: `${series.name} · ${series.className}`,
    rows: axes.map((axis) => {
      const value = score(series.id, axis.slug);
      return {
        key: axis.slug,
        label: axis.name,
        value: value === null ? absent : formatScore(value),
      };
    }),
    note: tc.normalizedNote,
  };
}

/** The same readout as one sentence, for the line under a dense figure. */
export function seriesWords(series: CompareSeries, axes: CompareAxisView[], score: ScoreOf): string {
  const parts = axes.map((axis) => {
    const value = score(series.id, axis.slug);
    return `${axis.label}: ${value === null ? absent : formatScore(value)}`;
  });
  return `${series.name} (${series.className}) — ${parts.join("; ")}`;
}

export function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}
