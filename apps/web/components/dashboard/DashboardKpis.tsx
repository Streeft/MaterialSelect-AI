"use client";

import type { DashboardComposition, DashboardOverview, DashboardProcesses } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { StatTile } from "./CoverageSummary";

const integer = (value: number) => Math.round(value).toLocaleString("pt-BR");

/**
 * The second KPI row of the panel (D-193): demonstration share, subclasses,
 * properties at the level, processes. Every number is a count the backend
 * sent; a tile whose source has not loaded yet is simply not drawn, never
 * drawn as 0.
 */
export function DashboardKpis({
  overview,
  composition,
  processes,
}: {
  overview: DashboardOverview;
  composition: DashboardComposition | undefined;
  processes: DashboardProcesses | undefined;
}) {
  const level = overview.filters?.level ?? 3;
  const leaves = composition?.cells.filter((c) => c.depth === 1) ?? [];
  const named = new Set(leaves.filter((c) => c.subclass !== null).map((c) => c.subclass)).size;
  const unnamed = leaves.filter((c) => c.subclass === null).reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        index={0}
        label={d.kpi.demo}
        value={overview.demo_materials}
        format={integer}
        note={d.kpi.demoOf(overview.materials)}
      />
      {composition ? (
        <StatTile
          index={1}
          label={d.kpi.subclasses}
          value={named}
          format={integer}
          note={d.kpi.subclassesNote(unnamed)}
        />
      ) : null}
      {processes ? (
        <StatTile
          index={2}
          label={d.kpi.withProcess}
          value={processes.materials_with_process}
          format={integer}
          note={d.kpi.propertiesNote(level)}
        />
      ) : null}
      {processes ? (
        <StatTile
          index={3}
          label={d.kpi.processes}
          value={processes.processes}
          format={integer}
          note={d.kpi.processesNote(processes.materials_without_process)}
        />
      ) : null}
    </div>
  );
}
