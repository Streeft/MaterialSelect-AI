import type { DashboardOverview } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { Badge, Card, CardBody } from "@/components/ui";

const t = ptBR.dashboard;

/** One number, named, in its own tile. */
function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
          {label}
        </span>
        <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
        {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
      </CardBody>
    </Card>
  );
}

/**
 * The four numbers a reader wants before anything else: how big the catalogue
 * is, and how much of it is actually filled in.
 *
 * `coverage.filled_pct` is `null` for an empty catalogue (§1.3: absence never
 * becomes a number), which is the one case this tile renders as a sentence
 * instead of a percentage — "0%" here would read as a verdict on data that
 * does not exist yet.
 */
export function CoverageSummary({ overview }: { overview: DashboardOverview }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label={t.materials}
        value={overview.materials.toLocaleString("pt-BR")}
        note={overview.demo_materials > 0 ? t.demoNote(overview.demo_materials) : undefined}
      />
      <Stat label={t.classes} value={overview.classes.toLocaleString("pt-BR")} />
      <Stat label={t.properties} value={overview.properties.toLocaleString("pt-BR")} />
      <Card>
        <CardBody className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t.overallCoverage}
          </span>
          {overview.coverage.filled_pct === null ? (
            <Badge tone="neutral" className="w-fit">
              {t.coverageEmpty}
            </Badge>
          ) : (
            <>
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {formatPercent(overview.coverage.filled_pct)}
              </span>
              <span className="text-xs text-ink-muted">
                {t.coverageOf(overview.coverage.filled, overview.coverage.slots)}
              </span>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
