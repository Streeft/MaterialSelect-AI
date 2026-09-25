"use client";

import { useMemo, useState } from "react";
import type { QualityBucket, QualitySlice } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { EmptyState } from "@/components/ui";
import { ChartFrame } from "../charts/ChartFrame";
import { FigureData, type FigureColumn } from "../charts/FigureData";
import {
  HorizontalBars,
  type BarOrientation,
  type BarRow,
  type BarSegment,
} from "../charts/HorizontalBars";
import { IconChartBarsHorizontal, IconChartColumns } from "@/components/ui/icons";
import { tok } from "../charts/figureKit";

const t = ptBR.dashboard;

// Fixed reading order — MEDIDO first (the strongest kind of evidence) down to
// NAO_REGISTRADO last (no evidence at all). The API has no reason to send the
// slices in this order, so the chart imposes it rather than trusting the wire.
const ORDER: QualityBucket[] = ["MEDIDO", "IMPORTADO", "ESTIMADO", "AUSENTE", "NAO_REGISTRADO"];

/**
 * The colour of each bucket, as the same tokens `DataQualityBadge` paints with,
 * so a bar here and the badge on a material sheet cannot disagree about what
 * "estimado" looks like. `NAO_REGISTRADO` is not a quality at all — it is a
 * slot with no row behind it — so it borrows `--edge-strong`, a neutral already
 * used for structure, instead of a sixth quality token invented for one chart.
 */
const BUCKET_TOKEN: Record<QualityBucket, `--${string}`> = {
  MEDIDO: "--quality-medido",
  IMPORTADO: "--quality-importado",
  ESTIMADO: "--quality-estimado",
  AUSENTE: "--quality-ausente",
  NAO_REGISTRADO: "--edge-strong",
};

/**
 * How the whole catalogue's (material, property) pairs split across the
 * panel's five-state vocabulary — MSDS `BarChart`, one row per state (D-80).
 *
 * A horizontal bar rather than a pie: five categories on a pie ask the eye to
 * compare angles, and the two smallest slices here (imported, estimated) are
 * usually the ones a reader most needs to see clearly. Each row is labelled in
 * words, so the figure needs no legend; the share at the end of each row is
 * the backend's `share_pct`, printed as sent.
 */
export function QualityMixChart({ slices }: { slices: QualitySlice[] }) {
  const bySlug = useMemo(() => new Map(slices.map((s) => [s.bucket, s])), [slices]);
  const ordered = useMemo(
    () => ORDER.map((bucket) => bySlug.get(bucket)).filter((s): s is QualitySlice => Boolean(s)),
    [bySlug],
  );
  const total = ordered.reduce((sum, s) => sum + s.count, 0);

  // One segment per row: each row is its own bucket, in its own colour.
  const segments = useMemo<BarSegment[]>(
    () =>
      ordered.map((s) => ({
        key: s.bucket,
        label: ptBR.quality[s.bucket],
        color: tok(BUCKET_TOKEN[s.bucket]),
      })),
    [ordered],
  );

  const rows = useMemo<BarRow[]>(
    () =>
      ordered.map((s) => ({
        key: s.bucket,
        label: ptBR.quality[s.bucket],
        values: { [s.bucket]: s.count },
        valueLabel:
          s.share_pct === null
            ? s.count.toLocaleString("pt-BR")
            : `${s.count.toLocaleString("pt-BR")} · ${formatPercent(s.share_pct)}`,
      })),
    [ordered],
  );

  const columns = useMemo<FigureColumn<QualitySlice>[]>(
    () => [
      {
        key: "count",
        header: t.columnCount,
        numeric: true,
        cell: (s) => s.count.toLocaleString("pt-BR"),
      },
      {
        key: "share",
        header: t.columnShare,
        numeric: true,
        cell: (s) => (s.share_pct === null ? null : formatPercent(s.share_pct)),
      },
    ],
    [],
  );

  // D-95: columns by default (the AI Studio figure); the corner switches to
  // horizontal bars, which read better when category names are long.
  const [orientation, setOrientation] = useState<BarOrientation>("vertical");

  return (
    <ChartFrame
      views={[
        { key: "vertical", label: ptBR.chart.viewColumns, icon: <IconChartColumns /> },
        { key: "horizontal", label: ptBR.chart.viewBars, icon: <IconChartBarsHorizontal /> },
      ]}
      view={orientation}
      onViewChange={(key) => setOrientation(key as BarOrientation)}
      title={t.qualityMixTitle}
      description={t.qualityMixHint}
      exportName={chartFileName("painel", "composicao-qualidade")}
      exportDisabled={total === 0}
      empty={total === 0 ? <EmptyState title={t.empty} /> : undefined}
      table={
        <FigureData
          caption={t.qualityMixFigure}
          rows={ordered}
          rowKey={(s) => s.bucket}
          rowHeader={{ header: t.columnBucket, cell: (s) => ptBR.quality[s.bucket] }}
          columns={columns}
        />
      }
    >
      <HorizontalBars
        orientation={orientation}
        figureLabel={ptBR.chart.figureLabel(t.qualityMixFigure)}
        segments={segments}
        rows={rows}
        showLegend={false}
        axisTitle={t.columnCount}
        describe={(row) => {
          const slice = bySlug.get(row.key as QualityBucket);
          const count = slice?.count ?? 0;
          const share =
            slice && slice.share_pct !== null ? ` (${formatPercent(slice.share_pct)})` : "";
          const segment = segments.find((s) => s.key === row.key);
          return {
            aria: `${row.label}: ${count.toLocaleString("pt-BR")}${share}`,
            tip: {
              title: row.label,
              rows: [
                {
                  key: "count",
                  label: t.columnCount,
                  value: count.toLocaleString("pt-BR"),
                  color: segment?.color,
                },
                ...(slice && slice.share_pct !== null
                  ? [{ key: "share", label: t.columnShare, value: formatPercent(slice.share_pct) }]
                  : []),
              ],
            },
          };
        }}
      />
    </ChartFrame>
  );
}
