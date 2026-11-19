"use client";

import type { DashboardCorrelationByClass } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { chartFileName } from "@/lib/charts";
import { Alert, EmptyState } from "@/components/ui";
import { CorrelationMatrix } from "./CorrelationMatrix";

const c = d.correlationByClass;

/**
 * D-250: the correlation matrix once per material class, side by side — small
 * multiples with the same properties in the same order, so a reader compares
 * one cell across classes by its place. Every ρ comes from
 * `dashboard_service.correlation_by_class()` (the same pairwise-complete
 * Spearman as the whole-catalogue matrix); a class too small for a pair shows
 * the hatched "dados insuficientes", never a 0.
 */
export function CorrelationByClass({ data }: { data: DashboardCorrelationByClass }) {
  return (
    <section aria-label={c.region} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-heading text-ink">{c.title}</h2>
        <p className="max-w-prose text-support text-ink-muted">{c.hint(data.min_pairs)}</p>
      </div>
      {data.panels.length === 0 ? (
        <EmptyState title={c.empty} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {data.panels.map((panel) => (
            <CorrelationMatrix
              key={panel.class_slug}
              data={{
                min_pairs: data.min_pairs,
                // The panel's own counts: how many of *this* class carry each property.
                properties: data.properties.map((p) => ({ ...p, count: panel.counts[p.slug] ?? 0 })),
                cells: panel.cells,
              }}
              title={c.panelTitle(panel.class_name, panel.materials)}
              description={null}
              figure={c.figure(panel.class_name)}
              exportName={chartFileName("painel", "correlacao", panel.class_slug)}
              showKey={false}
            />
          ))}
        </div>
      )}
      {data.omitted_classes > 0 ? (
        <Alert tone="info" role="status">
          {c.omitted(data.omitted_classes)}
        </Alert>
      ) : null}
    </section>
  );
}
