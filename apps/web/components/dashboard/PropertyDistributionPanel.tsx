"use client";

import { useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import type { ChartScale, DistributionBox, PropertyCoverage, PropertyDistribution } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { chartTheme, classVisual } from "@/lib/design/palette";
import {
  ButtonGroup,
  ButtonGroupItem,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Select,
  useResolvedTheme,
} from "@/components/ui";
import { ChartToolbar } from "../charts/ChartToolbar";
import { FigureData, type FigureColumn } from "../charts/FigureData";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const t = ptBR.dashboard;

function titleFor(name: string, unit: string | null): string {
  const pretty = prettyUnit(unit);
  return pretty ? `${name} [${pretty}]` : name;
}

/**
 * One property, one box per class that has it.
 *
 * The five numbers behind every box — min, Q1, median, Q3, max — come from
 * `apps/api/app/calculations/statistics.py` already computed (ADR 0004): this
 * component only hands them to Plotly's precomputed-quartile box trace, it
 * never derives a quantile itself.
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
  const container = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const paint = useMemo(() => chartTheme(theme), [theme]);

  const boxes = useMemo(() => distribution?.boxes ?? [], [distribution]);
  const sortedProperties = useMemo(
    () => [...properties].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [properties],
  );

  const traces = useMemo<Data[]>(
    () =>
      boxes.map((box) => {
        const visual = classVisual(box.class_slug);
        return {
          type: "box",
          name: box.class_name,
          x: [box.class_name],
          q1: [box.q1],
          median: [box.median],
          q3: [box.q3],
          lowerfence: [box.minimum],
          upperfence: [box.maximum],
          boxpoints: false,
          marker: { color: visual.color },
          line: { color: visual.color },
          fillcolor: visual.color,
          showlegend: false,
        } as unknown as Data;
      }),
    [boxes],
  );

  const layout = useMemo<Partial<Layout>>(() => {
    const base = paint.layout;
    return {
      ...base,
      autosize: true,
      height: 460,
      margin: { l: 80, r: 24, t: 16, b: 60 },
      showlegend: false,
      xaxis: { ...base.xaxis, automargin: true },
      yaxis: {
        ...base.yaxis,
        title: {
          text: distribution ? titleFor(distribution.property_name, distribution.canonical_unit) : "",
        },
        type: scale,
        zeroline: false,
      },
    };
  }, [paint, distribution, scale]);

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

  return (
    <Card>
      <CardHeader
        headingLevel={2}
        title={t.distributionTitle}
        description={t.distributionSubtitle}
        actions={
          <ChartToolbar
            target={container}
            disabled={boxes.length === 0}
            fileName={chartFileName("painel", "distribuicao", distribution?.property_name, scale)}
          />
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t.property} className="min-w-[14rem] flex-1">
            <Select value={selected} onChange={(e) => onSelect(e.target.value)}>
              {sortedProperties.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">{t.scale}</span>
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
          </div>
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

        {distribution && boxes.length === 0 && <EmptyState title={t.distributionEmpty} />}

        {distribution && boxes.length > 0 && (
          <>
            <div ref={container} role="img" aria-label={ptBR.chart.figureLabel(figureTitle)}>
              <Plot
                data={traces}
                layout={layout}
                config={{ displaylogo: false, responsive: true }}
                style={{ width: "100%" }}
                useResizeHandler
              />
            </div>
            <FigureData
              caption={figureTitle}
              rows={boxes}
              rowKey={(b) => b.class_slug}
              rowHeader={{ header: t.columnClass, cell: (b) => b.class_name }}
              columns={columns}
            />
          </>
        )}

        {distribution && distribution.classes_without_data.length > 0 && (
          <div className="text-xs text-ink-muted">
            <p className="font-medium text-ink-subtle">{t.classesWithoutData}</p>
            <p>{distribution.classes_without_data.join(", ")}</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
