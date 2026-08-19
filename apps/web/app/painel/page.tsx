"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardDistribution, getDashboardOverview } from "@/lib/api";
import type { ChartScale } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { CoverageSummary } from "@/components/dashboard/CoverageSummary";
import { QualityMixChart } from "@/components/dashboard/QualityMixChart";
import { ClassCoverageChart } from "@/components/dashboard/ClassCoverageChart";
import { GapsList } from "@/components/dashboard/GapsList";
import { PropertyDistributionPanel } from "@/components/dashboard/PropertyDistributionPanel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";

const t = ptBR.dashboard;

/**
 * The catalogue's own health screen: how much of it is filled in, with what
 * quality, class by class and property by property.
 *
 * Everything drawn here is counted or computed by `app/services/dashboard_service.py`
 * — coverage percentages, the quality mix, the five-number summaries behind
 * every box. The page only asks for the two endpoints and lays the numbers out
 * (ADR 0004: geometry is a backend concern, not a React one).
 */
export default function DashboardPage() {
  const overview = useQuery({ queryKey: ["dashboard-overview"], queryFn: getDashboardOverview });

  const [propertySlug, setPropertySlug] = useState<string | null>(null);
  const [scale, setScale] = useState<ChartScale>("linear");

  // Default to the property with the worst coverage — the one a reader most
  // likely came here to look at — once the overview has loaded.
  useEffect(() => {
    if (propertySlug !== null) return;
    const properties = overview.data?.by_property;
    if (!properties || properties.length === 0) return;
    const worst = [...properties].sort(
      (a, b) => (a.coverage.filled_pct ?? 0) - (b.coverage.filled_pct ?? 0),
    )[0];
    if (worst) setPropertySlug(worst.slug);
  }, [overview.data, propertySlug]);

  const distribution = useQuery({
    queryKey: ["dashboard-distribution", propertySlug],
    queryFn: () => getDashboardDistribution(propertySlug as string),
    enabled: propertySlug !== null,
  });

  // A property whose values cannot be plotted on a log axis (zero or negative
  // canonical values) silently disagreeing with a scale the reader already
  // picked would be worse than resetting it back to linear.
  useEffect(() => {
    if (distribution.data && distribution.data.allows_log_scale === false && scale === "log") {
      setScale("linear");
    }
  }, [distribution.data, scale]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t.subtitle}</p>
      </div>

      {overview.isLoading && <LoadingState label={t.loading} />}
      {overview.isError && (
        <ErrorState
          title={t.error}
          description={overview.error instanceof Error ? overview.error.message : undefined}
          onRetry={() => void overview.refetch()}
        />
      )}

      {overview.data && overview.data.materials === 0 && <EmptyState title={t.empty} />}

      {overview.data && overview.data.materials > 0 && (
        <>
          <CoverageSummary overview={overview.data} />

          <div className="grid gap-4 xl:grid-cols-2">
            <QualityMixChart slices={overview.data.by_quality} />
            <ClassCoverageChart classes={overview.data.by_class} />
          </div>

          <GapsList gaps={overview.data.gaps} />

          <PropertyDistributionPanel
            properties={overview.data.by_property}
            selected={propertySlug ?? ""}
            onSelect={setPropertySlug}
            scale={scale}
            onScaleChange={setScale}
            distribution={distribution.data}
            isLoading={distribution.isLoading}
            isError={distribution.isError}
            error={distribution.error}
            onRetry={() => void distribution.refetch()}
          />
        </>
      )}
    </div>
  );
}
