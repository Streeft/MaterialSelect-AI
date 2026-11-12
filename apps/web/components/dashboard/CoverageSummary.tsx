"use client";

import type { DashboardOverview } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { Badge, StatTile } from "@/components/ui";

const t = ptBR.dashboard;

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
      />
      <StatTile index={1} label={t.classes} value={overview.classes} format={integer} />
      <StatTile index={2} label={t.properties} value={overview.properties} format={integer} />
      {pct === null ? (
        <StatTile
          index={3}
          tone="inverted"
          label={t.overallCoverage}
          value={
            <Badge tone="neutral" className="w-fit">
              {t.coverageEmpty}
            </Badge>
          }
        />
      ) : (
        <StatTile
          index={3}
          tone="inverted"
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
