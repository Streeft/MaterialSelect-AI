"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardProcesses, ProcessFamilyUse, ProcessUse } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  RowHeader,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { ChartFrame } from "../charts/ChartFrame";
import { FigureData } from "../charts/FigureData";
import { HorizontalBars, type BarRow, type BarSegment } from "../charts/HorizontalBars";
import { tok } from "../charts/figureKit";

/** How many processes the bar chart shows before "Mostrar todos". */
const FIRST = 20;

/**
 * The process tab (D-193): processes per family, materials per process, and
 * how far processes reach into each material class.
 *
 * Built for any number of processes (the Ashby range is ~90, D-192): the
 * figure grows a row per process and shows the first twenty until the reader
 * asks for all; the table always carries every row. Counts and shares are the
 * backend's (`dashboard_service.processes()`), in five aggregate queries.
 */
export function ProcessPanels({ data }: { data: DashboardProcesses }) {
  const router = useRouter();
  const [all, setAll] = useState(false);

  const familySegments = useMemo<BarSegment[]>(
    () => [{ key: "processes", label: d.processes.columnProcesses, color: tok("--accent") }],
    [],
  );
  const familyRows = useMemo<BarRow[]>(
    () =>
      data.families.map((f) => ({
        key: f.slug,
        label: f.name,
        values: { processes: f.processes },
        valueLabel: `${f.processes.toLocaleString("pt-BR")} · ${f.materials.toLocaleString("pt-BR")} mat.`,
      })),
    [data.families],
  );

  const processSegments = useMemo<BarSegment[]>(
    () => [{ key: "materials", label: d.processes.columnMaterials, color: tok("--accent") }],
    [],
  );
  const shown = all ? data.by_process : data.by_process.slice(0, FIRST);
  const processRows = useMemo<BarRow[]>(
    () =>
      shown.map((p) => ({
        key: p.slug,
        label: p.name,
        values: { materials: p.materials },
        valueLabel:
          p.share_pct === null
            ? p.materials.toLocaleString("pt-BR")
            : `${p.materials.toLocaleString("pt-BR")} · ${formatPercent(p.share_pct)}`,
      })),
    [shown],
  );

  if (data.processes === 0) {
    return <EmptyState title={d.processes.empty} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ChartFrame
        title={d.processes.familiesTitle}
        description={d.processes.familiesHint}
        exportName={chartFileName("painel", "processos-por-familia")}
        table={
          <FigureData<ProcessFamilyUse>
            caption={d.processes.familiesFigure}
            rows={data.families}
            rowKey={(f) => f.slug}
            rowHeader={{ header: d.processes.columnFamily, cell: (f) => f.name }}
            columns={[
              { key: "group", header: d.processes.columnGroup, cell: (f) => f.root_name },
              {
                key: "processes",
                header: d.processes.columnProcesses,
                numeric: true,
                cell: (f) => f.processes.toLocaleString("pt-BR"),
              },
              {
                key: "materials",
                header: d.processes.columnReach,
                numeric: true,
                cell: (f) => f.materials.toLocaleString("pt-BR"),
              },
            ]}
          />
        }
      >
        <HorizontalBars
          figureLabel={ptBR.chart.figureLabel(d.processes.familiesFigure)}
          segments={familySegments}
          rows={familyRows}
          showLegend={false}
          axisTitle={d.processes.columnProcesses}
          onSelect={(row) => router.push(`/app/processos/familia/${encodeURIComponent(row.key)}`)}
          describe={(row) => {
            const family = data.families.find((f) => f.slug === row.key);
            return {
              aria: `${row.label}: ${family?.processes ?? 0} ${d.processes.columnProcesses.toLowerCase()}, ${family?.materials ?? 0} ${d.processes.columnReach.toLowerCase()}`,
              tip: {
                title: row.label,
                rows: [
                  { key: "group", label: d.processes.columnGroup, value: family?.root_name ?? "" },
                  {
                    key: "processes",
                    label: d.processes.columnProcesses,
                    value: (family?.processes ?? 0).toLocaleString("pt-BR"),
                    color: tok("--accent"),
                  },
                  {
                    key: "materials",
                    label: d.processes.columnReach,
                    value: (family?.materials ?? 0).toLocaleString("pt-BR"),
                  },
                ],
              },
            };
          }}
        />
      </ChartFrame>

      <ChartFrame
        title={d.processes.byProcessTitle}
        description={d.processes.byProcessHint}
        exportName={chartFileName("painel", "materiais-por-processo")}
        controls={
          data.by_process.length > FIRST ? (
            <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)} aria-pressed={all}>
              {all ? d.processes.showTop(FIRST) : d.processes.showAll(data.by_process.length)}
            </Button>
          ) : undefined
        }
        table={
          <FigureData<ProcessUse>
            caption={d.processes.byProcessFigure}
            rows={data.by_process}
            rowKey={(p) => p.slug}
            rowHeader={{ header: d.processes.columnProcess, cell: (p) => p.name }}
            columns={[
              { key: "family", header: d.processes.columnFamily, cell: (p) => p.family_name },
              {
                key: "materials",
                header: d.processes.columnMaterials,
                numeric: true,
                cell: (p) => p.materials.toLocaleString("pt-BR"),
              },
              {
                key: "share",
                header: d.processes.columnShare,
                numeric: true,
                cell: (p) => (p.share_pct === null ? null : formatPercent(p.share_pct)),
              },
            ]}
          />
        }
      >
        <HorizontalBars
          figureLabel={ptBR.chart.figureLabel(d.processes.byProcessFigure)}
          segments={processSegments}
          rows={processRows}
          showLegend={false}
          axisTitle={d.processes.columnMaterials}
          onSelect={(row) => router.push(`/app/processos/${encodeURIComponent(row.key)}`)}
          describe={(row) => ({
            aria: `${d.processes.open(row.label)} — ${row.valueLabel ?? ""}`,
          })}
        />
      </ChartFrame>

      <Card>
        <CardHeader headingLevel={2} title={d.processes.byClassTitle} />
        <CardBody>
          <TableScroll label={d.processes.byClassTitle}>
            <Table>
              <TableCaption>{d.processes.byClassTitle}</TableCaption>
              <THead>
                <Tr>
                  <Th>{d.processes.columnClass}</Th>
                  <Th numeric>{d.processes.columnClassMaterials}</Th>
                  <Th numeric>{d.processes.columnClassProcesses}</Th>
                </Tr>
              </THead>
              <TBody>
                {data.by_material_class.map((c) => (
                  <Tr key={c.class_slug}>
                    <RowHeader>{c.class_name}</RowHeader>
                    <Td numeric className="tabular-nums">
                      {c.materials.toLocaleString("pt-BR")}
                    </Td>
                    <Td numeric className="tabular-nums">
                      {c.processes.toLocaleString("pt-BR")}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        </CardBody>
      </Card>
    </div>
  );
}
