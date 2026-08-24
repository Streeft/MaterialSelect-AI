"use client";

import { useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import type { QualityBucket, QualitySlice } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { chartTheme, qualityBucketColor } from "@/lib/design/palette";
import { Card, CardBody, CardHeader, EmptyState, useResolvedTheme } from "@/components/ui";
import { ChartToolbar } from "../charts/ChartToolbar";
import { FigureData, type FigureColumn } from "../charts/FigureData";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const t = ptBR.dashboard;

// Fixed reading order — MEDIDO first (the strongest kind of evidence) down to
// NAO_REGISTRADO last (no evidence at all). The API has no reason to send the
// slices in this order, so the chart imposes it rather than trusting the wire.
const ORDER: QualityBucket[] = ["MEDIDO", "IMPORTADO", "ESTIMADO", "AUSENTE", "NAO_REGISTRADO"];

/**
 * How the whole catalogue's (material, property) pairs split across the
 * panel's five-state vocabulary.
 *
 * A horizontal bar rather than a pie: five categories on a pie ask the eye to
 * compare angles, and the two smallest slices here (imported, estimated) are
 * usually the ones a reader most needs to see clearly.
 */
export function QualityMixChart({ slices }: { slices: QualitySlice[] }) {
  const container = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const paint = useMemo(() => chartTheme(theme), [theme]);

  const bySlug = useMemo(() => new Map(slices.map((s) => [s.bucket, s])), [slices]);
  const ordered = useMemo(
    () => ORDER.map((bucket) => bySlug.get(bucket)).filter((s): s is QualitySlice => Boolean(s)),
    [bySlug],
  );
  const total = ordered.reduce((sum, s) => sum + s.count, 0);

  const traces = useMemo<Data[]>(() => {
    if (ordered.length === 0) return [];
    return [
      {
        type: "bar",
        orientation: "h",
        x: ordered.map((s) => s.count),
        y: ordered.map((s) => ptBR.quality[s.bucket]),
        marker: { color: ordered.map((s) => qualityBucketColor(s.bucket, theme)) },
        text: ordered.map((s) => (s.share_pct === null ? "" : formatPercent(s.share_pct))),
        textposition: "auto",
        hovertemplate: "%{y}: %{x}<extra></extra>",
      },
    ];
  }, [ordered, theme]);

  const layout = useMemo<Partial<Layout>>(() => {
    const base = paint.layout;
    return {
      ...base,
      autosize: true,
      height: 260,
      margin: { l: 120, r: 24, t: 16, b: 40 },
      xaxis: { ...base.xaxis, title: { text: t.columnCount }, zeroline: false },
      yaxis: { ...base.yaxis, automargin: true },
      showlegend: false,
    };
  }, [paint]);

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

  return (
    <Card className="min-w-0">
      <CardHeader
        headingLevel={2}
        title={t.qualityMixTitle}
        description={t.qualityMixHint}
        actions={
          <ChartToolbar
            target={container}
            disabled={total === 0}
            fileName={chartFileName("painel", "composicao-qualidade")}
          />
        }
      />
      <CardBody className="flex flex-col gap-3">
        {total === 0 ? (
          <EmptyState title={t.empty} />
        ) : (
          <>
            <div ref={container} role="img" aria-label={ptBR.chart.figureLabel(t.qualityMixFigure)}>
              <Plot
                data={traces}
                layout={layout}
                config={{ displaylogo: false, responsive: true }}
                style={{ width: "100%" }}
                useResizeHandler
              />
            </div>
            <FigureData
              caption={t.qualityMixFigure}
              rows={ordered}
              rowKey={(s) => s.bucket}
              rowHeader={{ header: t.columnBucket, cell: (s) => ptBR.quality[s.bucket] }}
              columns={columns}
            />
          </>
        )}
      </CardBody>
    </Card>
  );
}
