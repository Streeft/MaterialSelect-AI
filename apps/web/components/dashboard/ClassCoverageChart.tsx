"use client";

import { useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import type { ClassCoverage } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { chartTheme, token } from "@/lib/design/palette";
import { Card, CardBody, CardHeader, EmptyState, useResolvedTheme } from "@/components/ui";
import { ChartToolbar } from "../charts/ChartToolbar";
import { FigureData, type FigureColumn } from "../charts/FigureData";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const t = ptBR.dashboard;

/**
 * How complete each material class is, as three stacked segments per class.
 *
 * These three colours are not the quality palette — `QualityMixChart` already
 * owns MEDIDO/IMPORTADO/ESTIMADO/AUSENTE/NAO_REGISTRADO. Here the question is
 * coarser (is the slot filled at all?), so the segments borrow neutral tokens
 * instead of introducing a colour that means two different things on the same
 * page.
 */
export function ClassCoverageChart({ classes }: { classes: ClassCoverage[] }) {
  const container = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const paint = useMemo(() => chartTheme(theme), [theme]);

  const sorted = useMemo(
    () => [...classes].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [classes],
  );
  const hasSlots = sorted.some((c) => c.coverage.slots > 0);

  const traces = useMemo<Data[]>(() => {
    if (!hasSlots) return [];
    const names = sorted.map((c) => c.name);
    const segments: { key: "filled" | "declared_missing" | "not_recorded"; label: string; color: string }[] = [
      { key: "filled", label: t.filled, color: token("--success", 1, theme) },
      { key: "declared_missing", label: t.declaredMissing, color: token("--quality-ausente", 1, theme) },
      { key: "not_recorded", label: t.notRecorded, color: token("--edge-strong", 1, theme) },
    ];
    return segments.map((segment) => ({
      type: "bar",
      orientation: "h",
      name: segment.label,
      y: names,
      x: sorted.map((c) => c.coverage[segment.key]),
      marker: { color: segment.color },
      hovertemplate: `%{y}<br>${segment.label}: %{x}<extra></extra>`,
    }));
  }, [sorted, hasSlots, theme]);

  const layout = useMemo<Partial<Layout>>(() => {
    const base = paint.layout;
    return {
      ...base,
      autosize: true,
      barmode: "stack",
      height: Math.max(220, 60 + sorted.length * 36),
      margin: { l: 140, r: 24, t: 16, b: 40 },
      xaxis: { ...base.xaxis, title: { text: t.columnCoverage }, zeroline: false },
      yaxis: { ...base.yaxis, automargin: true },
      legend: { ...base.legend, orientation: "h", y: -0.2 },
    };
  }, [paint, sorted.length]);

  const columns = useMemo<FigureColumn<ClassCoverage>[]>(
    () => [
      {
        key: "materials",
        header: t.columnMaterials,
        numeric: true,
        cell: (c) => c.materials.toLocaleString("pt-BR"),
      },
      {
        key: "filled",
        header: t.filled,
        numeric: true,
        cell: (c) => c.coverage.filled.toLocaleString("pt-BR"),
      },
      {
        key: "declared_missing",
        header: t.declaredMissing,
        numeric: true,
        cell: (c) => c.coverage.declared_missing.toLocaleString("pt-BR"),
      },
      {
        key: "not_recorded",
        header: t.notRecorded,
        numeric: true,
        cell: (c) => c.coverage.not_recorded.toLocaleString("pt-BR"),
      },
      {
        key: "coverage",
        header: t.columnCoverage,
        numeric: true,
        cell: (c) => (c.coverage.filled_pct === null ? null : formatPercent(c.coverage.filled_pct)),
      },
    ],
    [],
  );

  return (
    <Card className="min-w-0">
      <CardHeader
        headingLevel={2}
        title={t.classCoverageTitle}
        description={t.classCoverageHint}
        actions={
          <ChartToolbar
            target={container}
            disabled={!hasSlots}
            fileName={chartFileName("painel", "cobertura-por-classe")}
          />
        }
      />
      <CardBody className="flex flex-col gap-3">
        {sorted.length === 0 ? (
          <EmptyState title={t.empty} />
        ) : (
          <>
            <div
              ref={container}
              role="img"
              aria-label={ptBR.chart.figureLabel(t.classCoverageFigure)}
            >
              <Plot
                data={traces}
                layout={layout}
                config={{ displaylogo: false, responsive: true }}
                style={{ width: "100%" }}
                useResizeHandler
              />
            </div>
            <FigureData
              caption={t.classCoverageFigure}
              rows={sorted}
              rowKey={(c) => c.slug}
              rowHeader={{ header: t.columnClass, cell: (c) => c.name }}
              columns={columns}
            />
          </>
        )}
      </CardBody>
    </Card>
  );
}
