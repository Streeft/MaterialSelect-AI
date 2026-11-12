"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SPRING, useSpring } from "@/lib/msds";

export type StatTileTone = "default" | "highlight" | "inverted";

/**
 * A number that counts up to its value — MSDS's `useCountUp`, which is
 * `useSpring(effectsDefault)` from 0 (D-80). The spring honours
 * `prefers-reduced-motion` itself (it jumps straight to the target).
 *
 * `lib/msds` is `@ts-nocheck`, so the hook is typed here, at the one place the
 * app calls it for a number.
 */
function useCountUp(target: number, enabled: boolean): number {
  const shown = (useSpring as (target: number, preset: unknown, from?: number) => number)(
    enabled ? target : 0,
    SPRING.effectsDefault,
    0,
  );
  return enabled ? shown : target;
}

/**
 * One figure with its label (D-209): the panel's KPIs and the battery pack's
 * results were two components drawing the same thing. Now one, in two sizes:
 *
 * - `size="hero"` (default): MSDS `StatTile` — eyebrow label, a mono number,
 *   a note and an optional meter. With `format`, a numeric `value` counts up;
 *   the moving number is `aria-hidden` and a screen reader gets the final value
 *   instead ("0… 12… 48… 75" would be the animation read aloud). MSDS's
 *   sparkline and trend chip are left out: they need a history the app does
 *   not have, and are never drawn from an invented series (principle 1).
 * - `size="compact"`: the same label over value + unit, in a well, for grids
 *   of four inside a card. The value arrives formatted (`formatNumber`).
 *
 * `index` staggers a row's entry, left to right in reading order. `tone`:
 * `highlight` marks the figure the card is about; `inverted` is the dark
 * frame that judges rather than counts (the panel's overall coverage).
 */
export function StatTile({
  label,
  value,
  format,
  unit,
  note,
  index = 0,
  meter,
  tone = "default",
  size = "hero",
}: {
  label: string;
  /** A number with `format` (counts up), or a node already formatted. */
  value: number | ReactNode;
  format?: (value: number) => string;
  unit?: string;
  note?: ReactNode;
  index?: number;
  /** A 0–100 share the backend computed, drawn as a thin meter under the number. */
  meter?: number;
  tone?: StatTileTone;
  size?: "hero" | "compact";
}) {
  const numeric = typeof value === "number" && format !== undefined;
  const shown = useCountUp(typeof value === "number" ? value : 0, numeric && size === "hero");

  if (size === "compact") {
    return (
      <div
        data-stat-tile
        className={cn(
          "flex min-w-0 flex-col gap-1 rounded-control p-3",
          tone === "highlight" ? "bg-brand-50" : "bg-well",
        )}
      >
        <span className="text-caption font-semibold text-ink-muted">{label}</span>
        <div className="flex flex-wrap items-baseline gap-1">
          <span className="text-lg font-semibold tabular-nums text-ink">
            {numeric ? format!(value as number) : (value as ReactNode)}
          </span>
          {unit ? <span className="text-xs text-ink-muted">{unit}</span> : null}
        </div>
        {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
      </div>
    );
  }

  const inverted = tone === "inverted";
  const surface: CSSProperties | undefined = inverted
    ? { background: "rgb(var(--rail))", borderColor: "transparent" }
    : tone === "highlight"
      ? { background: "rgb(var(--brand-50))" }
      : undefined;
  return (
    <div
      data-stat-tile
      className="msds-stat rise relative min-w-0 overflow-hidden"
      style={{ animationDelay: `${index * 40}ms`, ...surface }}
    >
      {!inverted ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" /> : null}
      <div className={inverted ? "msds-stat-label text-rail-accent" : "msds-stat-label"}>{label}</div>
      <div>
        {numeric ? (
          <>
            <span
              aria-hidden
              className={inverted ? "msds-stat-value text-rail-ink" : "msds-stat-value"}
              data-stat-animated
            >
              {format!(shown)}
            </span>
            <span className="sr-only">{format!(value as number)}</span>
          </>
        ) : typeof value === "string" || typeof value === "number" ? (
          <span className={inverted ? "msds-stat-value text-rail-ink" : "msds-stat-value"}>{value}</span>
        ) : (
          <div className="mt-2">{value}</div>
        )}
        {unit ? <span className="msds-stat-unit">{unit}</span> : null}
      </div>
      {meter !== undefined && numeric ? (
        <div
          aria-hidden
          className="mt-3 h-1.5 overflow-hidden rounded-full"
          style={{ background: inverted ? "rgb(var(--rail-ink) / 0.14)" : "var(--surface-300)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, (shown / Math.max(value as number, 1e-9)) * meter))}%`,
              background: inverted ? "rgb(var(--rail-accent))" : "rgb(var(--accent))",
            }}
          />
        </div>
      ) : null}
      {note ? (
        <div className={inverted ? "mt-2 text-xs text-rail-ink-muted" : "mt-2 text-xs text-ink-muted"}>
          {note}
        </div>
      ) : null}
    </div>
  );
}
