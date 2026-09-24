"use client";

import { useMemo } from "react";
import type { ChartScale, DistributionBox, PropertyCoverage, PropertyDistribution } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { classVisual } from "@/lib/design/palette";
import {
  ButtonGroup,
  ButtonGroupItem,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  SelectOption,
} from "@/components/ui";
import { ChartFrame } from "../charts/ChartFrame";
import { FigureData, type FigureColumn } from "../charts/FigureData";
import { BoxPlotChart, type BoxRow } from "../charts/BoxPlotChart";

const t = ptBR.dashboard;

function titleFor(name: string, unit: string | null): string {
  const pretty = prettyUnit(unit);
  return pretty ? `${name} [${pretty}]` : name;
}

/**
 * One property, one box per class that has it — MSDS `BoxPlot` (D-80).
 *
 * The five numbers behind every box — min, Q1, median, Q3, max — come from
 * `apps/api/app/calculations/statistics.py` already computed (ADR 0004): this
 * component only places them on an axis, it never derives a quantile itself.
 * The axis names `display_unit` when the backend sent one — the unit the box
 * numbers are actually in (D-70) — and the canonical unit otherwise.
 */
export function PropertyDistributionPanel({
  properties,
  selected,
  onSelect,
  scale,
  onScaleChange,
  distribution,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  properties: PropertyCoverage[];
  selected: string;
  onSelect: (slug: string) => void;
  scale: ChartScale;
  onScaleChange: (scale: ChartScale) => void;
  distribution: PropertyDistribution | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const boxes = useMemo(() => distribution?.boxes ?? [], [distribution]);
  const sortedProperties = useMemo(
    () => [...properties].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [properties],
  );
  const unit = distribution ? (distribution.display_unit ?? distribution.canonical_unit) : null;
  const unitLabel = prettyUnit(unit);

  const rows = useMemo<BoxRow[]>(
    () =>
      boxes.map((box) => {
        const visual = classVisual(box.class_slug);
        return {
          key: box.class_slug,
          label: box.class_name,
          color: visual.color,
          symbol: visual.symbol,
          count: box.count,
          minimum: box.minimum,
          q1: box.q1,
          median: box.median,
          q3: box.q3,
          maximum: box.maximum,
        };
      }),
    [boxes],
  );

  const columns = useMemo<FigureColumn<DistributionBox>[]>(
    () => [
      { key: "count", header: t.columnCountBox, numeric: true, cell: (b) => b.count.toLocaleString("pt-BR") },
      { key: "min", header: t.columnMin, numeric: true, cell: (b) => formatNumber(b.minimum) },
      { key: "q1", header: t.columnQ1, numeric: true, cell: (b) => formatNumber(b.q1) },
      { key: "median", header: t.columnMedian, numeric: true, cell: (b) => formatNumber(b.median) },
      { key: "q3", header: t.columnQ3, numeric: true, cell: (b) => formatNumber(b.q3) },
      { key: "max", header: t.columnMax, numeric: true, cell: (b) => formatNumber(b.maximum) },
    ],
    [],
  );

  const figureTitle = distribution ? t.distributionFigure(distribution.property_name) : t.distributionTitle;
  const withUnit = (value: number) => (unitLabel ? `${formatNumber(value)} ${unitLabel}` : formatNumber(value));

  return (
    <ChartFrame
      title={t.distributionTitle}
      description={t.distributionSubtitle}
      exportName={chartFileName("painel", "distribuicao", distribution?.property_name, scale)}
      exportDisabled={boxes.length === 0}
      controls={
        <ButtonGroup label={t.scale}>
          {(["linear", "log"] as ChartScale[]).map((option) => (
            <ButtonGroupItem
              key={option}
              selected={scale === option}
              label={option === "linear" ? t.linear : t.log}
              disabled={option === "log" && distribution?.allows_log_scale === false}
              onClick={() => onScaleChange(option)}
            />
          ))}
        </ButtonGroup>
      }
      notice={
        <div className="mb-3 flex flex-col gap-2">
          <div className="w-full max-w-md">
            <Select label={t.property} value={selected} onChange={(e) => onSelect(e.target.value)}>
              {sortedProperties.map((p) => (
                <SelectOption key={p.slug} value={p.slug}>
                  {p.name}
                </SelectOption>
              ))}
            </Select>
          </div>
          {distribution?.allows_log_scale === false && (
            <p className="text-xs text-ink-muted">{t.logDisabled}</p>
          )}
          {isLoading && <LoadingState label={t.loading} />}
          {isError && (
            <ErrorState
              title={t.error}
              description={error instanceof Error ? error.message : undefined}
              onRetry={onRetry}
            />
          )}
        </div>
      }
      empty={
        !distribution ? (
          <></>
        ) : boxes.length === 0 ? (
          <EmptyState title={t.distributionEmpty} />
        ) : undefined
      }
      table={
        <FigureData
          caption={figureTitle}
          rows={boxes}
          rowKey={(b) => b.class_slug}
          rowHeader={{ header: t.columnClass, cell: (b) => b.class_name }}
          columns={columns}
        />
      }
      footer={
        distribution && distribution.classes_without_data.length > 0 ? (
          <div className="mt-3 text-xs text-ink-muted">
            <p className="font-medium text-ink-subtle">{t.classesWithoutData}</p>
            <p>{distribution.classes_without_data.join(", ")}</p>
          </div>
        ) : null
      }
    >
      {distribution ? (
        <BoxPlotChart
            figureLabel={ptBR.chart.figureLabel(figureTitle)}
            rows={rows}
            scale={scale}
            axisTitle={titleFor(distribution.property_name, unit)}
            describe={(row) => ({
              aria: `${row.label}: ${t.columnMin} ${withUnit(row.minimum)}, ${t.columnQ1} ${withUnit(row.q1)}, ${t.columnMedian} ${withUnit(row.median)}, ${t.columnQ3} ${withUnit(row.q3)}, ${t.columnMax} ${withUnit(row.maximum)}; ${row.count} ${t.columnCountBox.toLowerCase()}`,
              info: (
                <>
                  <strong>{row.label}</strong> — {t.columnMin.toLowerCase()} {formatNumber(row.minimum)} ·{" "}
                  {t.columnQ1} {formatNumber(row.q1)} · {t.columnMedian.toLowerCase()}{" "}
                  <strong>{formatNumber(row.median)}</strong> · {t.columnQ3} {formatNumber(row.q3)} ·{" "}
                  {t.columnMax.toLowerCase()} {formatNumber(row.maximum)}
                  {unitLabel ? ` ${unitLabel}` : ""} · n = {row.count}
                </>
              ),
            })}
          />
      ) : null}
    </ChartFrame>
  );
}
