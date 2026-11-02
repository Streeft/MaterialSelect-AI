"use client";

import type { DashboardPropertyStats } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { formatNumber, formatPercent, prettyUnit } from "@/lib/format";
import { MathTex } from "@/components/expression/MathTex";

/**
 * One property's summary as a row of read-only figures (D-193): how many
 * materials carry it, the median, the mean, the range and the quartiles, in
 * the reading unit the backend converted to. A statistic of nothing is written
 * as "sem valores", never as 0 (D-24).
 */
export function PropertyStatsTiles({ stats }: { stats: DashboardPropertyStats }) {
  const unit = prettyUnit(stats.display_unit);
  const u = unit && unit !== "—" ? ` ${unit}` : "";
  const num = (v: number | null) => (v === null ? d.property.noValues : `${formatNumber(v)}${u}`);
  const pair = (a: number | null, b: number | null) =>
    a === null || b === null ? d.property.noValues : `${formatNumber(a)} – ${formatNumber(b)}${u}`;

  const items: { key: string; label: string; value: string }[] = [
    {
      key: "count",
      label: d.property.count,
      value: stats.count.toLocaleString("pt-BR"),
    },
    {
      key: "coverage",
      label: d.property.coverage,
      value: stats.coverage_pct === null ? d.property.noCoverage : formatPercent(stats.coverage_pct),
    },
    { key: "median", label: d.property.median, value: num(stats.median) },
    { key: "mean", label: d.property.mean, value: num(stats.mean) },
    { key: "range", label: d.property.range, value: pair(stats.minimum, stats.maximum) },
    { key: "iqr", label: d.property.iqr, value: pair(stats.q1, stats.q3) },
    { key: "missing", label: d.property.missing, value: stats.declared_missing.toLocaleString("pt-BR") },
    { key: "not_recorded", label: d.property.notRecorded, value: stats.not_recorded.toLocaleString("pt-BR") },
  ];

  return (
    <div className="flex flex-col gap-3">
      {stats.symbol_latex ? (
        <p className="text-support text-ink-muted">
          <MathTex latex={stats.symbol_latex} label={stats.property_name} /> · {stats.property_name}
          {u ? ` (${unit})` : ""}
        </p>
      ) : null}
      <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
        {items.map((item) => (
          <div key={item.key} className="well min-w-0 rounded-control p-3">
            <dt className="text-caption text-ink-muted">{item.label}</dt>
            <dd className="m-0 mt-1 break-words font-mono text-support tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
