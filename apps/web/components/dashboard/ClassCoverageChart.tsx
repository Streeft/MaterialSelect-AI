"use client";

import { useMemo } from "react";
import type { ClassCoverage } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { EmptyState } from "@/components/ui";
import { ChartFrame } from "../charts/ChartFrame";
import { FigureData, type FigureColumn } from "../charts/FigureData";
import { HorizontalBars, type BarRow, type BarSegment } from "../charts/HorizontalBars";
import { tok } from "../charts/figureKit";

const t = ptBR.dashboard;

type SegmentKey = "filled" | "declared_missing" | "not_recorded";

/**
 * How complete each material class is, as three stacked segments per class —
 * MSDS `BarChart` (D-80).
 *
 * These three colours are not the quality palette — `QualityMixChart` already
 * owns MEDIDO/IMPORTADO/ESTIMADO/AUSENTE/NAO_REGISTRADO. Here the question is
 * coarser (is the slot filled at all?), so the segments borrow neutral tokens
 * instead of introducing a colour that means two different things on the same
 * page.
 *
 * The number at the end of each row is `coverage.filled_pct`, computed by the
 * backend. A class with no slots has no percentage, and says so in words —
 * never "0%" (D-24).
 */
export function ClassCoverageChart({ classes }: { classes: ClassCoverage[] }) {
  const sorted = useMemo(
    () => [...classes].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [classes],
  );
  const hasSlots = sorted.some((c) => c.coverage.slots > 0);

  const segments = useMemo<BarSegment[]>(
    () => [
      { key: "filled", label: t.filled, color: tok("--success") },
      { key: "declared_missing", label: t.declaredMissing, color: tok("--quality-ausente") },
      { key: "not_recorded", label: t.notRecorded, color: tok("--edge-strong") },
    ],
    [],
  );

  const rows = useMemo<BarRow[]>(
    () =>
      sorted.map((c) => ({
        key: c.slug,
        label: c.name,
        values: {
          filled: c.coverage.filled,
          declared_missing: c.coverage.declared_missing,
          not_recorded: c.coverage.not_recorded,
        },
        valueLabel:
          c.coverage.filled_pct === null ? t.noSlots : formatPercent(c.coverage.filled_pct),
      })),
    [sorted],
  );

  const bySlug = useMemo(() => new Map(sorted.map((c) => [c.slug, c])), [sorted]);

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
    <ChartFrame
      title={t.classCoverageTitle}
      description={t.classCoverageHint}
      exportName={chartFileName("painel", "cobertura-por-classe")}
      exportDisabled={!hasSlots}
      empty={sorted.length === 0 ? <EmptyState title={t.empty} /> : undefined}
      table={
        <FigureData
          caption={t.classCoverageFigure}
          rows={sorted}
          rowKey={(c) => c.slug}
          rowHeader={{ header: t.columnClass, cell: (c) => c.name }}
          columns={columns}
        />
      }
    >
      <HorizontalBars
        figureLabel={ptBR.chart.figureLabel(t.classCoverageFigure)}
        segments={segments}
        rows={rows}
        toggleable
        axisTitle={t.columnCount}
        describe={(row, segment) => {
          const slots = bySlug.get(row.key)?.coverage.slots ?? 0;
          const count = row.values[segment.key as SegmentKey] ?? 0;
          return {
            aria: `${row.label}: ${segment.label}, ${count.toLocaleString("pt-BR")} ${t.ofSlots(slots)}`,
            info: (
              <>
                <strong>{row.label}</strong> — {segment.label}:{" "}
                <strong>{count.toLocaleString("pt-BR")}</strong> {t.ofSlots(slots)}
              </>
            ),
          };
        }}
      />
    </ChartFrame>
  );
}
