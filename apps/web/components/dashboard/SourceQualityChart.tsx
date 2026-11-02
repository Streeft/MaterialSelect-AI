"use client";

import { useMemo } from "react";
import type { DashboardSources, SourceQuality } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { EmptyState } from "@/components/ui";
import { ChartFrame } from "../charts/ChartFrame";
import { FigureData } from "../charts/FigureData";
import { HorizontalBars, type BarRow, type BarSegment } from "../charts/HorizontalBars";
import { tok } from "../charts/figureKit";

type Key = "medido" | "importado" | "estimado" | "declared_missing";

/**
 * Provenance per source (D-193): one stacked bar per source, in the quality
 * tokens every badge of the app already paints with — so "estimado" here and on
 * a material sheet cannot disagree. Counts and shares from
 * `dashboard_service.sources()`.
 */
export function SourceQualityChart({ data }: { data: DashboardSources }) {
  const segments = useMemo<BarSegment[]>(
    () => [
      { key: "medido", label: ptBR.quality.MEDIDO, color: tok("--quality-medido") },
      { key: "importado", label: ptBR.quality.IMPORTADO, color: tok("--quality-importado") },
      { key: "estimado", label: ptBR.quality.ESTIMADO, color: tok("--quality-estimado") },
      { key: "declared_missing", label: ptBR.quality.AUSENTE, color: tok("--quality-ausente") },
    ],
    [],
  );
  const name = (s: SourceQuality) =>
    s.label === null ? d.quality.noSource : s.is_demo ? `${s.label} (${d.quality.demoSource})` : s.label;
  const rows = useMemo<BarRow[]>(
    () =>
      data.sources.map((s) => ({
        key: s.key,
        label: name(s),
        values: { medido: s.medido, importado: s.importado, estimado: s.estimado, declared_missing: s.declared_missing },
        valueLabel: s.share_pct === null ? s.values.toLocaleString("pt-BR") : formatPercent(s.share_pct),
      })),
    [data.sources],
  );
  const empty = data.sources.length === 0;

  return (
    <ChartFrame
      title={d.quality.sourcesTitle}
      description={d.quality.sourcesHint}
      exportName={chartFileName("painel", "qualidade-por-fonte")}
      exportDisabled={empty}
      empty={empty ? <EmptyState title={d.quality.empty} /> : undefined}
      table={
        <FigureData<SourceQuality>
          caption={d.quality.sourcesFigure}
          rows={data.sources}
          rowKey={(s) => s.key}
          rowHeader={{ header: d.quality.columnSource, cell: name }}
          columns={[
            { key: "materials", header: d.quality.columnMaterials, numeric: true, cell: (s) => s.materials.toLocaleString("pt-BR") },
            { key: "values", header: d.quality.columnValues, numeric: true, cell: (s) => s.values.toLocaleString("pt-BR") },
            ...segments.map((seg) => ({
              key: seg.key,
              header: seg.label,
              numeric: true,
              cell: (s: SourceQuality) => s[seg.key as Key].toLocaleString("pt-BR"),
            })),
            {
              key: "share",
              header: d.quality.columnShare,
              numeric: true,
              cell: (s) => (s.share_pct === null ? null : formatPercent(s.share_pct)),
            },
          ]}
        />
      }
    >
      <HorizontalBars
        figureLabel={ptBR.chart.figureLabel(d.quality.sourcesFigure)}
        segments={segments}
        rows={rows}
        toggleable
        axisTitle={d.quality.columnValues}
        describe={(row, segment) => ({
          aria: `${row.label}: ${segment.label}, ${(row.values[segment.key] ?? 0).toLocaleString("pt-BR")}`,
        })}
      />
    </ChartFrame>
  );
}
