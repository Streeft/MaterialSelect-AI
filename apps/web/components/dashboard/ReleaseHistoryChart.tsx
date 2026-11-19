"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardReleases } from "@/lib/api";
import type { DashboardFilters, ReleasePoint } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { ptBR } from "@/lib/i18n";
import { formatDate, formatPercent } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/ui";
import { ChartFrame } from "../charts/ChartFrame";
import { FigureData } from "../charts/FigureData";
import { HorizontalBars, type BarRow, type BarSegment } from "../charts/HorizontalBars";
import { tok } from "../charts/figureKit";

const r = d.releases;
const integer = (n: number) => n.toLocaleString("pt-BR");

/** The name a release goes by: its declared release, or the slug that identifies it. */
export function releaseLabel(point: ReleasePoint): string {
  return point.release ?? point.slug;
}

/**
 * D-250: the catalogue's history, one column per imported release, in import
 * order — the values with a number and the declared absences each one brought,
 * stacked (never summed into one "values" bar: principle 3). The counts were
 * kept by the import itself (`catalog_release_count`); the share and the
 * change since the previous release of the same lineage come from
 * `dashboard_service.releases()`. Only the demo filter reaches this figure —
 * the counts are of whole releases, and the card says so.
 */
export function ReleaseHistoryChart({ filters }: { filters: DashboardFilters }) {
  const history = useQuery({
    queryKey: ["dashboard-releases", filters.demo ?? "todos"],
    queryFn: () => getDashboardReleases({ demo: filters.demo }),
  });
  const segments = useMemo<BarSegment[]>(
    () => [
      { key: "filled", label: r.filled, color: tok("--success") },
      { key: "missing", label: r.missing, color: tok("--quality-ausente") },
    ],
    [],
  );

  if (history.isLoading) return <ChartSkeleton label={r.loading} />;
  if (history.isError || !history.data) {
    return <ErrorState title={r.error} error={history.error} onRetry={() => void history.refetch()} />;
  }
  const points = history.data.points;
  const rows: BarRow[] = points.map((p) => ({
    key: p.slug,
    label: releaseLabel(p),
    values: { filled: p.counts.values_filled, missing: p.counts.values_declared_missing },
    valueLabel: p.filled_share_pct === null ? r.noShare : formatPercent(p.filled_share_pct),
  }));

  return (
    <ChartFrame
      title={r.title}
      description={r.hint}
      exportName={chartFileName("painel", "catalogo-por-versao")}
      exportDisabled={points.length === 0}
      empty={points.length === 0 ? <EmptyState title={r.empty} description={r.emptyHint} /> : undefined}
      table={
        <FigureData<ReleasePoint>
          caption={r.figure}
          rows={points}
          rowKey={(p) => p.slug}
          rowHeader={{
            header: r.columnRelease,
            cell: (p) => (
              <span className="flex flex-col">
                <span>{releaseLabel(p)}</span>
                <span className="text-caption text-ink-muted">
                  {[p.lineage, p.is_demo ? r.demo : null, p.origin === "backfill" ? r.backfill : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            ),
          }}
          columns={[
            { key: "imported", header: r.columnImported, cell: (p) => formatDate(p.imported_at) ?? "—" },
            { key: "materials", header: r.columnMaterials, numeric: true, cell: (p) => integer(p.counts.materials) },
            { key: "classes", header: r.columnClasses, numeric: true, cell: (p) => integer(p.counts.classes) },
            { key: "properties", header: r.columnProperties, numeric: true, cell: (p) => integer(p.counts.properties) },
            { key: "filled", header: r.columnFilled, numeric: true, cell: (p) => integer(p.counts.values_filled) },
            {
              key: "missing",
              header: r.columnMissing,
              numeric: true,
              cell: (p) => integer(p.counts.values_declared_missing),
            },
            {
              key: "share",
              header: r.columnShare,
              numeric: true,
              cell: (p) => (p.filled_share_pct === null ? r.noShare : formatPercent(p.filled_share_pct)),
            },
            { key: "processes", header: r.columnProcesses, numeric: true, cell: (p) => integer(p.counts.processes) },
            {
              key: "change",
              header: r.columnChange,
              cell: (p) => (p.change ? r.change(p.change.materials, p.change.values_filled) : r.first),
            },
          ]}
        />
      }
    >
      <HorizontalBars
        orientation="vertical"
        figureLabel={ptBR.chart.figureLabel(r.figure)}
        segments={segments}
        rows={rows}
        toggleable
        describe={(row, segment) => ({
          aria: r.barAria(row.label, segment.label, row.values[segment.key] ?? 0),
        })}
      />
    </ChartFrame>
  );
}
