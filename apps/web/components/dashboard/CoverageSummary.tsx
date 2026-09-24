"use client";

import type { CSSProperties } from "react";
import type { DashboardOverview } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { SPRING, useSpring } from "@/lib/msds";
import { Badge } from "@/components/ui";

const t = ptBR.dashboard;

/**
 * A number that counts up to its value — MSDS's `useCountUp`, which is
 * `useSpring(effectsDefault)` from 0 (D-80). The spring honours
 * `prefers-reduced-motion` itself (it jumps straight to the target).
 *
 * `lib/msds` is `@ts-nocheck`, so the hook is typed here, at the one place the
 * app calls it for a number.
 */
function useCountUp(target: number): number {
  return (useSpring as (target: number, preset: unknown, from?: number) => number)(
    target,
    SPRING.effectsDefault,
    0,
  );
}

/**
 * MSDS `StatTile`: eyebrow label, a mono number counting up, a note underneath.
 *
 * The visible number is `aria-hidden` and a screen reader gets the final value
 * instead: announcing "0… 12… 48… 75" would be the animation read aloud. MSDS's
 * tile also carries a sparkline and a trend chip — both need a history of this
 * number, which the dashboard does not have. They are left out rather than
 * drawn from an invented series (principle 1).
 *
 * `index` staggers the row's entry, left to right in reading order.
 */
function StatTile({
  label,
  value,
  format,
  note,
  index,
  meter,
  inverted = false,
}: {
  label: string;
  value: number;
  format: (value: number) => string;
  note?: string;
  index: number;
  /** A 0–100 share the backend computed, drawn as a thin meter under the number. */
  meter?: number;
  inverted?: boolean;
}) {
  const shown = useCountUp(value);
  const surface: CSSProperties | undefined = inverted
    ? { background: "rgb(var(--rail))", borderColor: "transparent" }
    : undefined;
  return (
    <div
      className="msds-stat rise relative min-w-0 overflow-hidden"
      style={{ animationDelay: `${index * 40}ms`, ...surface }}
    >
      {!inverted ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" /> : null}
      <div className={inverted ? "msds-stat-label text-rail-accent" : "msds-stat-label"}>{label}</div>
      <div>
        <span
          aria-hidden
          className={inverted ? "msds-stat-value text-rail-ink" : "msds-stat-value"}
          data-stat-animated
        >
          {format(shown)}
        </span>
        <span className="sr-only">{format(value)}</span>
      </div>
      {meter !== undefined ? (
        <div
          aria-hidden
          className="mt-3 h-1.5 overflow-hidden rounded-full"
          style={{ background: inverted ? "rgb(var(--rail-ink) / 0.14)" : "var(--surface-300)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, (shown / Math.max(value, 1e-9)) * meter))}%`,
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

const integer = (value: number) => Math.round(value).toLocaleString("pt-BR");

/**
 * The four numbers a reader wants before anything else: the catalog's size,
 * and how much of it is actually filled.
 *
 * `coverage.filled_pct` is `null` in an empty catalog (§1.3: absence never
 * becomes a number), and it's the only case where this frame comes out as prose
 * instead of a percentage — "0%" here would read as a verdict on data that doesn't
 * exist yet.
 *
 * The fourth frame is inverted on purpose: overall coverage is the only one of
 * the four that judges the catalog, not counts it. Its meter is the same
 * `filled_pct`, drawn — not a second number.
 */
export function CoverageSummary({ overview }: { overview: DashboardOverview }) {
  const pct = overview.coverage.filled_pct;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        index={0}
        label={t.materials}
        value={overview.materials}
        format={integer}
        note={overview.demo_materials > 0 ? t.demoNote(overview.demo_materials) : undefined}
      />
      <StatTile index={1} label={t.classes} value={overview.classes} format={integer} />
      <StatTile index={2} label={t.properties} value={overview.properties} format={integer} />
      {pct === null ? (
        <div
          className="msds-stat rise min-w-0"
          style={{ animationDelay: "120ms", background: "rgb(var(--rail))", borderColor: "transparent" }}
        >
          <div className="msds-stat-label text-rail-accent">{t.overallCoverage}</div>
          <Badge tone="neutral" className="mt-2 w-fit">
            {t.coverageEmpty}
          </Badge>
        </div>
      ) : (
        <StatTile
          index={3}
          inverted
          label={t.overallCoverage}
          value={pct}
          format={(value) => formatPercent(value)}
          meter={pct}
          note={t.coverageOf(overview.coverage.filled, overview.coverage.slots)}
        />
      )}
    </div>
  );
}
