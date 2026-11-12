"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { SolveResult, SolvedRecord } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { FigureData, type FigureColumn } from "@/components/charts/FigureData";
import { HorizontalBars, type BarRow, type BarSegment } from "@/components/charts/HorizontalBars";
import { tok } from "@/components/charts/figureKit";
import { IconChartBarsHorizontal } from "@/components/ui/icons";

const t = ptBR.solver.chart;

/**
 * The answer of a solver run as bars, one per material, in the order of the
 * ranking (D-216). The table is a fine place to read a number and a bad one to
 * see how far apart the first and the fifth are.
 *
 * It draws what the API sent: each bar is `objective_value` (a mass, or a
 * material cost) exactly as the table prints it, and the order is the server's
 * rank. Nothing is recomputed, normalised or re-sorted here; the bar length is
 * pixel scaling inside `HorizontalBars`. A material the run could not size is
 * not in `solved` and so has no bar — it is listed under "Fora deste
 * dimensionamento", never drawn as zero.
 */
export function SolveResultChart({ result }: { result: SolveResult }) {
  const router = useRouter();
  const isCost = result.objective === "custo";
  const unit = result.objective_unit;

  const segments = useMemo<BarSegment[]>(
    () => [{ key: "objective", label: result.objective_label, color: tok("--brand-600") }],
    [result.objective_label],
  );
  const rows = useMemo<BarRow[]>(
    () =>
      result.solved.map((record) => ({
        key: String(record.record_id),
        label: record.name,
        values: { objective: record.objective_value },
        valueLabel: `${formatNumber(record.objective_value)} ${unit}`,
      })),
    [result.solved, unit],
  );
  const byId = useMemo(
    () => new Map(result.solved.map((record) => [String(record.record_id), record])),
    [result.solved],
  );

  const columns = useMemo<FigureColumn<SolvedRecord>[]>(
    () => [
      { key: "rank", header: t.columnRank, numeric: true, cell: (r) => String(r.rank) },
      {
        key: "objective",
        header: `${result.objective_label} (${unit})`,
        numeric: true,
        cell: (r) => formatNumber(r.objective_value),
      },
      {
        key: "index",
        header: t.tooltipIndex,
        numeric: true,
        cell: (r) => formatNumber(r.index_value),
      },
      {
        key: "free",
        header: `${t.tooltipSection} (${result.free_unit})`,
        numeric: true,
        cell: (r) => formatNumber(r.free_value),
      },
    ],
    [result.objective_label, result.free_unit, unit],
  );

  if (result.solved.length === 0) return null;

  return (
    <ChartFrame
      figureIcon={<IconChartBarsHorizontal />}
      title={isCost ? t.titleCost : t.title}
      description={t.hint}
      headingLevel={3}
      exportName={chartFileName("dimensionar", result.case.key)}
      table={
        <FigureData
          caption={ptBR.chart.figureLabel(t.figure)}
          rows={result.solved}
          rowKey={(r) => r.record_id}
          rowHeader={{ header: t.columnMaterial, cell: (r) => r.name }}
          columns={columns}
        />
      }
    >
      <HorizontalBars
        orientation="horizontal"
        figureLabel={ptBR.chart.figureLabel(t.figure)}
        segments={segments}
        rows={rows}
        showLegend={false}
        axisTitle={t.axis(unit)}
        onSelect={(row) => router.push(`/app/materiais/${row.key}`)}
        describe={(row) => {
          const record = byId.get(row.key);
          return {
            aria: `${record?.rank ?? ""}. ${row.label}: ${row.valueLabel ?? ""}`,
            tip: {
              title: row.label,
              rows: [
                {
                  key: "objective",
                  label: result.objective_label,
                  value: row.valueLabel ?? "",
                  color: tok("--brand-600"),
                  symbol: "square",
                },
                ...(record
                  ? [
                      { key: "rank", label: t.tooltipRank, value: String(record.rank) },
                      { key: "index", label: t.tooltipIndex, value: formatNumber(record.index_value) },
                    ]
                  : []),
              ],
            },
          };
        }}
      />
    </ChartFrame>
  );
}
