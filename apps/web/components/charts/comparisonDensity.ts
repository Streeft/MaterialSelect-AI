/**
 * How the comparison figures thin out as the selection grows (D-187).
 *
 * No figure refuses a selection. With a few materials they draw as always; past
 * `DENSE_FROM` they change *form*: bars get a minimum thickness and a tall,
 * scrolling plot, lines get thin and translucent, and what the pointer or the
 * keyboard is on stands out. Everything here is presentation arithmetic (a
 * thickness, an opacity, which row a pointer is on): no score, no statistic,
 * nothing the backend computed is recomputed (ADR 0004).
 */

/** Series count past which a figure draws in its dense form. */
export const DENSE_FROM = 30;

/** Rows the shared tooltip lists before it shows only the series under the pointer. */
export const TOOLTIP_ROWS = 8;

/** The tallest a scrolling figure gets before its own scroll bar takes over. */
export const FIGURE_MAX_HEIGHT = 640;

export interface BarMetrics {
  /** Thickness of one bar. */
  bar: number;
  /** Space between two bars of one group. */
  gap: number;
}

/**
 * Bar thickness and spacing for `n` series in a group. Up to twelve the bars are
 * as fat as they always were; past that they hold a minimum thickness (4 px, 3
 * px past sixty) and the plot grows taller, in proportion to `n`, instead.
 */
export function barMetrics(n: number): BarMetrics {
  if (n <= 4) return { bar: 14, gap: 3 };
  if (n <= 8) return { bar: 11, gap: 3 };
  if (n <= 12) return { bar: 9, gap: 3 };
  if (n <= 60) return { bar: 4, gap: 1 };
  return { bar: 3, gap: 1 };
}

/** Opacity of one line among `n`: full up to the dense threshold, then fading as 1/√n, never invisible. */
export function lineOpacity(n: number): number {
  if (n <= DENSE_FROM) return 0.9;
  return Math.max(0.1, Math.min(0.9, 0.9 * Math.sqrt(DENSE_FROM / n)));
}

/** Stroke width of a line among `n`: 2 px as before, then hairline. */
export function lineWidth(n: number): number {
  return n <= DENSE_FROM ? 2 : 1;
}

/** Height of the parallel-coordinates plot: 340 px, then 0.8 px per extra line, up to 760 px. */
export function parallelHeight(n: number): number {
  if (n <= DENSE_FROM) return 340;
  return Math.round(Math.min(760, 340 + (n - DENSE_FROM) * 0.8));
}

/**
 * Which bar of a grouped bar plot a vertical offset falls on.
 *
 * `offset` is measured from the top of the SVG. Returns the group (property)
 * index and the row (material) index, or `null` on the gap between two groups or
 * outside the plot.
 */
export function barAt(
  offset: number,
  layout: { top: number; groupHeight: number; groupGap: number; groups: number; rows: number } & BarMetrics,
): { group: number; row: number } | null {
  const local = offset - layout.top;
  if (local < 0) return null;
  const pitch = layout.groupHeight + layout.groupGap;
  const group = Math.floor(local / pitch);
  if (group < 0 || group >= layout.groups) return null;
  const within = local - group * pitch;
  if (within > layout.groupHeight) return null;
  const row = Math.min(layout.rows - 1, Math.floor(within / (layout.bar + layout.gap)));
  return row < 0 ? null : { group, row };
}
