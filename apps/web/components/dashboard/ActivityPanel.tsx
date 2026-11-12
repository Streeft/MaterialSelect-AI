"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardActivity } from "@/lib/api";
import type { ActivityMonth, AIDay } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { ptBR } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { chartFileName } from "@/lib/charts";
import { Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingState, StatTile } from "@/components/ui";
import { ChartFrame } from "../charts/ChartFrame";
import { FigureData } from "../charts/FigureData";
import { HorizontalBars, type BarRow, type BarSegment } from "../charts/HorizontalBars";
import { tok } from "../charts/figureKit";

const integer = (value: number) => Math.round(value).toLocaleString("pt-BR");

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" → "out/26". Formatting only. */
function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1] ?? month}/${(year ?? "").slice(2)}`;
}

/** "2026-10-31" → "31/10". */
function dayLabel(key: string): string {
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}

/**
 * "Minha atividade" (D-193): the reader's own studies, saved charts and
 * notebooks per month, their audit trail and their AI use — nobody else's
 * numbers (`GET /api/dashboard/activity` reads only the caller's rows). The
 * panel's catalogue filters do not apply here, and the tab says so.
 */
export function ActivityPanel() {
  const activity = useQuery({ queryKey: ["dashboard-activity"], queryFn: getDashboardActivity });

  const monthSegments = useMemo<BarSegment[]>(
    () => [
      { key: "studies", label: d.activity.studies, color: tok("--accent") },
      { key: "charts", label: d.activity.charts, color: tok("--brand-300") },
      { key: "notebooks", label: d.activity.notebooks, color: tok("--brand-800") },
    ],
    [],
  );
  const aiSegments = useMemo<BarSegment[]>(
    () => [{ key: "requests", label: d.activity.columnRequests, color: tok("--accent") }],
    [],
  );

  if (activity.isLoading) return <LoadingState label={d.activity.loading} />;
  if (activity.isError || !activity.data) {
    return (
      <ErrorState
        title={d.activity.error} error={activity.error}
        onRetry={() => void activity.refetch()}
      />
    );
  }
  const data = activity.data;
  const ai = data.ai;
  const monthRows: BarRow[] = data.months.map((m) => ({
    key: m.month,
    label: monthLabel(m.month),
    values: { studies: m.studies, charts: m.charts, notebooks: m.notebooks },
  }));
  const aiRows: BarRow[] = ai.days.map((day) => ({
    key: day.day,
    label: dayLabel(day.day),
    values: { requests: day.requests },
  }));
  const anyMonth = data.months.some((m) => m.studies + m.charts + m.notebooks > 0);
  const anyAI = ai.days.some((day) => day.requests > 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-support text-ink-muted">{d.activity.intro}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile index={0} label={d.activity.studies} value={data.studies} format={integer} />
        <StatTile index={1} label={d.activity.charts} value={data.charts} format={integer} />
        <StatTile index={2} label={d.activity.notebooks} value={data.notebooks} format={integer} />
        <StatTile index={3} label={d.activity.ownMaterials} value={data.own_materials} format={integer} />
        <StatTile
          index={4}
          tone="inverted"
          label={d.activity.aiToday}
          value={ai.today.requests}
          format={integer}
          note={`${d.activity.aiTodayNote(ai.today.requests, ai.ai_daily_limit)} · ${d.activity.aiTodayDetail(
            ai.today.artifacts,
            ai.today.fetches,
            ai.fetch_daily_limit,
          )}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title={d.activity.monthsTitle}
          description={d.activity.monthsHint}
          exportName={chartFileName("painel", "minha-atividade")}
          exportDisabled={!anyMonth}
          empty={anyMonth ? undefined : <EmptyState title={d.activity.monthsEmpty} />}
          table={
            <FigureData<ActivityMonth>
              caption={d.activity.monthsFigure}
              rows={data.months}
              rowKey={(m) => m.month}
              rowHeader={{ header: d.activity.columnMonth, cell: (m) => monthLabel(m.month) }}
              columns={monthSegments.map((s) => ({
                key: s.key,
                header: s.label,
                numeric: true,
                cell: (m: ActivityMonth) => m[s.key as "studies" | "charts" | "notebooks"].toLocaleString("pt-BR"),
              }))}
            />
          }
        >
          <HorizontalBars
            orientation="vertical"
            figureLabel={ptBR.chart.figureLabel(d.activity.monthsFigure)}
            segments={monthSegments}
            rows={monthRows}
            toggleable
            describe={(row, segment) => ({
              aria: `${row.label}: ${segment.label}, ${(row.values[segment.key] ?? 0).toLocaleString("pt-BR")}`,
            })}
          />
        </ChartFrame>

        <ChartFrame
          title={d.activity.aiTitle}
          description={d.activity.aiHint(ai.ai_daily_limit)}
          exportName={chartFileName("painel", "meu-uso-de-ia")}
          exportDisabled={!anyAI}
          empty={anyAI ? undefined : <EmptyState title={d.activity.aiEmpty} />}
          table={
            <FigureData<AIDay>
              caption={d.activity.aiFigure}
              rows={ai.days}
              rowKey={(day) => day.day}
              rowHeader={{ header: d.activity.columnDay, cell: (day) => dayLabel(day.day) }}
              columns={[
                { key: "requests", header: d.activity.columnRequests, numeric: true, cell: (day) => day.requests.toLocaleString("pt-BR") },
                { key: "artifacts", header: d.activity.columnArtifacts, numeric: true, cell: (day) => day.artifacts.toLocaleString("pt-BR") },
                { key: "fetches", header: d.activity.columnFetches, numeric: true, cell: (day) => day.fetches.toLocaleString("pt-BR") },
              ]}
            />
          }
        >
          <HorizontalBars
            orientation="vertical"
            figureLabel={ptBR.chart.figureLabel(d.activity.aiFigure)}
            segments={aiSegments}
            rows={aiRows}
            showLegend={false}
            describe={(row) => ({
              aria: `${row.label}: ${(row.values.requests ?? 0).toLocaleString("pt-BR")} ${d.activity.columnRequests.toLowerCase()}`,
            })}
          />
        </ChartFrame>
      </div>

      <Card>
        <CardHeader
          headingLevel={2}
          title={d.activity.recentTitle}
          description={d.activity.actionsSummary(data.actions)}
        />
        <CardBody>
          {data.recent.length === 0 ? (
            <EmptyState title={d.activity.recentEmpty} />
          ) : (
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {data.recent.map((event, i) => (
                <li key={`${event.entity_type}-${event.entity_id}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-support">
                  <span className="font-medium">
                    {d.activity.actions[event.action] ?? event.action}{" "}
                    {d.activity.entities[event.entity_type] ?? event.entity_type}
                  </span>
                  <span className="min-w-0 break-words">{event.entity_label}</span>
                  <span className="text-caption text-ink-muted">{formatDate(event.created_at) ?? ""}</span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
