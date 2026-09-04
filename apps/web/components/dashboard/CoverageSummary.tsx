import type { DashboardOverview } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { Badge, Card, CardBody } from "@/components/ui";

const t = ptBR.dashboard;

/**
 * A number, labeled, in its own frame.
 *
 * `accent` is the 4px bar on the left edge: it follows the section hue
 * and is what makes the row of four numbers visibly belong to the panel
 * instead of floating. `index` provides staggered entry — the grid rises from
 * left to right, in reading order.
 */
function Stat({
  label,
  value,
  note,
  index,
}: {
  label: string;
  value: string;
  note?: string;
  index: number;
}) {
  return (
    <Card riseIndex={index} className="relative overflow-hidden">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />
      <CardBody className="flex flex-col gap-1">
        <span className="font-mono text-2xs uppercase tracking-eyebrow text-ink-subtle">
          {label}
        </span>
        <span className="text-3xl font-bold tabular-nums tracking-tight text-ink">{value}</span>
        {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
      </CardBody>
    </Card>
  );
}

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
 * the four that judges the catalog, not counts it.
 */
export function CoverageSummary({ overview }: { overview: DashboardOverview }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        index={0}
        label={t.materials}
        value={overview.materials.toLocaleString("pt-BR")}
        note={overview.demo_materials > 0 ? t.demoNote(overview.demo_materials) : undefined}
      />
      <Stat index={1} label={t.classes} value={overview.classes.toLocaleString("pt-BR")} />
      <Stat index={2} label={t.properties} value={overview.properties.toLocaleString("pt-BR")} />
      <Card riseIndex={3} className="border-transparent bg-rail">
        <CardBody className="flex flex-col gap-1">
          <span className="font-mono text-2xs uppercase tracking-eyebrow text-rail-accent">
            {t.overallCoverage}
          </span>
          {overview.coverage.filled_pct === null ? (
            <Badge tone="neutral" className="w-fit">
              {t.coverageEmpty}
            </Badge>
          ) : (
            <>
              <span className="text-3xl font-bold tabular-nums tracking-tight text-rail-ink">
                {formatPercent(overview.coverage.filled_pct)}
              </span>
              <span className="text-xs text-rail-ink-muted">
                {t.coverageOf(overview.coverage.filled, overview.coverage.slots)}
              </span>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
