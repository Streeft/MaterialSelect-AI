"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  dashboardExportUrl,
  getDashboardComposition,
  getDashboardCorrelation,
  getDashboardDistribution,
  getDashboardOverview,
  getDashboardProcesses,
  getDashboardPropertyStats,
  getDashboardSources,
  listClasses,
} from "@/lib/api";
import type {
  ChartScale,
  DashboardComposition,
  DashboardFilters,
  DashboardOverview,
  DashboardProcesses,
  DashboardSection,
  PropertyCoverage,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import {
  activeFilterCount,
  catalogueHref,
  DASHBOARD_TABS,
  dashboardSearch,
  mapHref,
  readDashboardState,
  type DashboardViewState,
} from "@/lib/dashboardState";
import { formatPercent } from "@/lib/format";
import { CoverageSummary } from "@/components/dashboard/CoverageSummary";
import { DashboardKpis } from "@/components/dashboard/DashboardKpis";
import { QualityMixChart } from "@/components/dashboard/QualityMixChart";
import { ClassCoverageChart } from "@/components/dashboard/ClassCoverageChart";
import { GapsList } from "@/components/dashboard/GapsList";
import { PropertyDistributionPanel } from "@/components/dashboard/PropertyDistributionPanel";
import { CompositionTreemap } from "@/components/dashboard/CompositionTreemap";
import { HistogramChart } from "@/components/dashboard/HistogramChart";
import { PropertyStatsTiles } from "@/components/dashboard/PropertyStatsTiles";
import { TopRanking } from "@/components/dashboard/TopRanking";
import { CorrelationMatrix } from "@/components/dashboard/CorrelationMatrix";
import { CorrelationPicker } from "@/components/dashboard/CorrelationPicker";
import { ProcessPanels } from "@/components/dashboard/ProcessPanels";
import { SourceQualityChart } from "@/components/dashboard/SourceQualityChart";
import { ActivityPanel } from "@/components/dashboard/ActivityPanel";
import {
  Bar,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  MenuButton,
  MenuItem,
  PageHeader,
  RowHeader,
  Select,
  SelectOption,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Tabs,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { IconDownload } from "@/components/ui/icons";

const t = ptBR.dashboard;

/**
 * The catalogue panel (D-193): five tabs over one set of global filters.
 *
 * Everything drawn here is counted or computed by
 * `app/services/dashboard_service.py` — coverage, the quality mix, the boxes,
 * the treemap's rectangles, the histogram's bins, the rankings and the
 * correlation matrix. The page asks the endpoints and lays the numbers out
 * (ADR 0004: geometry is a backend concern, not a React one).
 *
 * The tab, the filters and the property being read live in the URL, so a view
 * can be linked and reopened as it was.
 */
export default function DashboardPage() {
  // `useSearchParams` needs a boundary, or `next build` refuses the page.
  return (
    <Suspense fallback={<LoadingState label={t.loading} />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = useMemo(() => readDashboardState(params), [params]);
  const { tab, filters } = state;
  const update = (patch: Partial<DashboardViewState>) =>
    router.replace(`${pathname}${dashboardSearch({ ...state, ...patch })}`, { scroll: false });
  const setFilters = (patch: Partial<DashboardFilters>) => update({ filters: { ...filters, ...patch } });

  const overview = useQuery({
    queryKey: ["dashboard-overview", filters],
    queryFn: () => getDashboardOverview(filters),
    placeholderData: (previous) => previous,
  });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  // The subclass picker lists the subclasses of the chosen class (and demo
  // choice) regardless of the subclass already picked, so it can be changed.
  const optionsFilters = { classe: filters.classe, demo: filters.demo };
  const subclassOptions = useQuery({
    queryKey: ["dashboard-composition", optionsFilters],
    queryFn: () => getDashboardComposition(optionsFilters),
  });
  const composition = useQuery({
    queryKey: ["dashboard-composition", filters],
    queryFn: () => getDashboardComposition(filters),
    enabled: tab === "visao",
  });
  const processes = useQuery({
    queryKey: ["dashboard-processes", filters],
    queryFn: () => getDashboardProcesses(filters),
    enabled: tab === "visao" || tab === "processos",
  });

  const subclasses = useMemo(() => {
    const names = new Set<string>();
    for (const cell of subclassOptions.data?.cells ?? []) {
      if (cell.depth === 1 && cell.subclass) names.add(cell.subclass);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [subclassOptions.data]);

  const active = activeFilterCount(filters);
  const section: DashboardSection = tab;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
       
        actions={
          <>
            <MenuButton label={d.actions.exportLabel} icon={<IconDownload />}>
              <MenuItem href={dashboardExportUrl(section, filters)} download hint={d.actions.exportCsvHint}>
                {d.actions.exportCsv}
              </MenuItem>
            </MenuButton>
            <ButtonLink href="/app/selecao" variant="primary" size="sm">
              {d.actions.newSelection}
            </ButtonLink>
          </>
        }
      />

      <Card>
        <CardHeader headingLevel={2} title={d.filters.title} description={d.filters.hint} />
        <CardBody className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <Select
            label={d.filters.classe}
            value={filters.classe ?? ""}
            onChange={(e) => setFilters({ classe: e.target.value || null, subclasse: null })}
          >
            <SelectOption value="">{d.filters.allClasses}</SelectOption>
            {(classes.data ?? []).map((c) => (
              <SelectOption key={c.slug} value={c.slug}>
                {c.name}
              </SelectOption>
            ))}
          </Select>
          <Select
            label={d.filters.subclasse}
            value={filters.subclasse ?? ""}
            onChange={(e) => setFilters({ subclasse: e.target.value || null })}
          >
            <SelectOption value="">{d.filters.allSubclasses}</SelectOption>
            {filters.subclasse && !subclasses.includes(filters.subclasse) ? (
              <SelectOption value={filters.subclasse}>{filters.subclasse}</SelectOption>
            ) : null}
            {subclasses.map((name) => (
              <SelectOption key={name} value={name}>
                {name}
              </SelectOption>
            ))}
          </Select>
          <Select
            label={d.filters.nivel}
            value={String(filters.nivel ?? 3)}
            onChange={(e) => setFilters({ nivel: Number(e.target.value) as 1 | 2 | 3 })}
          >
            {[1, 2, 3].map((level) => (
              <SelectOption key={level} value={String(level)}>
                {d.filters.nivelOption(level)}
              </SelectOption>
            ))}
          </Select>
          <Select
            label={d.filters.demo}
            value={filters.demo ?? "todos"}
            onChange={(e) => setFilters({ demo: e.target.value as DashboardFilters["demo"] })}
          >
            <SelectOption value="todos">{d.filters.demoTodos}</SelectOption>
            <SelectOption value="demo">{d.filters.demoDemo}</SelectOption>
            <SelectOption value="reais">{d.filters.demoReais}</SelectOption>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            disabled={active === 0}
            onClick={() => update({ filters: {}, property: state.property })}
          >
            {d.filters.clear}
          </Button>
        </CardBody>
        {overview.data ? (
          <CardBody className="pt-0">
            <p className="text-caption text-ink-muted" role="status">
              {active > 0 ? `${d.filters.active(active)} · ` : ""}
              {overview.data.materials === 0 ? d.filters.emptyScope : d.filters.scope(overview.data.materials)}
            </p>
          </CardBody>
        ) : null}
      </Card>

      <Tabs
        label={d.tabsLabel}
        items={DASHBOARD_TABS.map((id) => ({ id, label: d.tabs[id] }))}
        value={tab}
        onChange={(id) => update({ tab: id })}
        panelClassName="flex flex-col gap-6 pt-4"
      >
        {tab === "atividade" ? (
          <ActivityPanel />
        ) : (
          <CatalogueTab
            tab={tab}
            state={state}
            overview={overview}
            composition={composition}
            processes={processes}
            onProperty={(slug) => update({ property: slug })}
          />
        )}
      </Tabs>
    </div>
  );
}

type OverviewQuery = UseQueryResult<DashboardOverview>;
type CompositionQuery = UseQueryResult<DashboardComposition>;
type ProcessesQuery = UseQueryResult<DashboardProcesses>;

function CatalogueTab({
  tab,
  state,
  overview,
  composition,
  processes,
  onProperty,
}: {
  tab: DashboardSection;
  state: DashboardViewState;
  overview: OverviewQuery;
  composition: CompositionQuery;
  processes: ProcessesQuery;
  onProperty: (slug: string) => void;
}) {
  if (overview.isLoading) return <LoadingState label={t.loading} />;
  if (overview.isError || !overview.data) {
    return (
      <ErrorState
        title={t.error}
        description={overview.error instanceof Error ? overview.error.message : undefined}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  const data = overview.data;
  if (data.materials === 0) {
    return <EmptyState title={activeFilterCount(state.filters) > 0 ? d.filters.emptyScope : t.empty} />;
  }

  if (tab === "visao") {
    return (
      <>
        <CoverageSummary overview={data} />
        <DashboardKpis overview={data} composition={composition.data} processes={processes.data} />
        {composition.isError ? (
          <ErrorState title={d.error} onRetry={() => void composition.refetch()} />
        ) : composition.data ? (
          <CompositionTreemap data={composition.data} />
        ) : (
          <LoadingState label={d.loading} />
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          <QualityMixChart slices={data.by_quality} />
          <ClassCoverageChart classes={data.by_class} catalogue={(slug) => catalogueHref(slug)} />
        </div>
        <GapsList gaps={data.gaps} />
      </>
    );
  }
  if (tab === "propriedades") {
    return <PropertiesTab state={state} properties={data.by_property} onProperty={onProperty} />;
  }
  if (tab === "processos") {
    if (processes.isLoading) return <LoadingState label={d.loading} />;
    if (processes.isError || !processes.data) {
      return <ErrorState title={d.error} onRetry={() => void processes.refetch()} />;
    }
    return <ProcessPanels data={processes.data} />;
  }
  return <QualityTab state={state} properties={data.by_property} overviewQuality={data.by_quality} />;
}

/** The worst-covered property: the one a reader most likely came to look at. */
function worstCovered(properties: PropertyCoverage[]): string | null {
  if (properties.length === 0) return null;
  const worst = [...properties].sort(
    (a, b) => (a.coverage.filled_pct ?? 0) - (b.coverage.filled_pct ?? 0),
  )[0];
  return worst?.slug ?? null;
}

function PropertiesTab({
  state,
  properties,
  onProperty,
}: {
  state: DashboardViewState;
  properties: PropertyCoverage[];
  onProperty: (slug: string) => void;
}) {
  const { filters } = state;
  const visible = properties.some((p) => p.slug === state.property);
  const property = (visible ? state.property : null) ?? worstCovered(properties) ?? "";
  const name = properties.find((p) => p.slug === property)?.name ?? property;
  const [scale, setScale] = useState<ChartScale>("linear");
  const [chosen, setChosen] = useState<string[] | null>(null);

  const stats = useQuery({
    queryKey: ["dashboard-property", property, filters],
    queryFn: () => getDashboardPropertyStats(property, filters),
    enabled: property !== "",
  });
  const distribution = useQuery({
    queryKey: ["dashboard-distribution", property, filters],
    queryFn: () => getDashboardDistribution(property, filters),
    enabled: property !== "",
  });
  const correlation = useQuery({
    queryKey: ["dashboard-correlation", chosen, filters],
    queryFn: () => getDashboardCorrelation(chosen, filters),
    placeholderData: (previous) => previous,
  });

  // A property that refuses a log axis must not keep a log scale the reader
  // picked for another one.
  if (distribution.data && distribution.data.allows_log_scale === false && scale === "log") {
    setScale("linear");
  }
  const partner = property === "densidade" ? "modulo_young" : "densidade";

  return (
    <>
      <Card>
        <CardHeader
          headingLevel={2}
          title={d.property.statsTitle(name)}
          actions={
            <ButtonLink href={mapHref(property, partner)} variant="tonal" size="sm">
              {d.actions.openMap}
            </ButtonLink>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <Select
            label={d.property.pickerLabel}
            value={property}
            onChange={(e) => onProperty(e.target.value)}
            className="max-w-md"
          >
            {properties.map((p) => (
              <SelectOption key={p.slug} value={p.slug}>
                {p.name}
              </SelectOption>
            ))}
          </Select>
          {stats.isLoading ? <LoadingState label={d.loading} /> : null}
          {stats.isError ? <ErrorState title={d.error} onRetry={() => void stats.refetch()} /> : null}
          {stats.data ? <PropertyStatsTiles stats={stats.data} /> : null}
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {stats.data ? <HistogramChart stats={stats.data} /> : <LoadingState label={d.loading} />}
        <PropertyDistributionPanel
          properties={properties}
          selected={property}
          onSelect={onProperty}
          scale={scale}
          onScaleChange={setScale}
          distribution={distribution.data}
          isLoading={distribution.isLoading}
          isError={distribution.isError}
          error={distribution.error}
          onRetry={() => void distribution.refetch()}
          picker={false}
        />
      </div>

      <TopRanking properties={properties} property={property} filters={filters} />

      <CorrelationPicker properties={properties} chosen={chosen} onChange={setChosen} />
      {correlation.isLoading ? <LoadingState label={d.loading} /> : null}
      {correlation.isError ? (
        <ErrorState
          title={d.error}
          description={correlation.error instanceof Error ? correlation.error.message : undefined}
          onRetry={() => void correlation.refetch()}
        />
      ) : null}
      {correlation.data ? <CorrelationMatrix data={correlation.data} /> : null}
    </>
  );
}

function QualityTab({
  state,
  properties,
  overviewQuality,
}: {
  state: DashboardViewState;
  properties: PropertyCoverage[];
  overviewQuality: Parameters<typeof QualityMixChart>[0]["slices"];
}) {
  const sources = useQuery({
    queryKey: ["dashboard-sources", state.filters],
    queryFn: () => getDashboardSources(state.filters),
  });
  // Already ranked by the backend's numbers; sorting by the count is reading,
  // not computing (the same order `_gaps` uses).
  const ordered = [...properties].sort(
    (a, b) => a.coverage.filled - b.coverage.filled || a.name.localeCompare(b.name, "pt-BR"),
  );
  return (
    <>
      {sources.isLoading ? <LoadingState label={d.loading} /> : null}
      {sources.isError ? <ErrorState title={d.error} onRetry={() => void sources.refetch()} /> : null}
      {sources.data ? <SourceQualityChart data={sources.data} /> : null}
      <QualityMixChart slices={overviewQuality} />
      <Card>
        <CardHeader headingLevel={2} title={d.quality.propertyTableTitle} description={d.quality.propertyTableHint} />
        <CardBody>
          <TableScroll label={d.quality.propertyTableTitle}>
            <Table>
              <TableCaption>{d.quality.propertyTableTitle}</TableCaption>
              <THead>
                <Tr>
                  <Th>{t.property}</Th>
                  <Th numeric>{t.columnCoverage}</Th>
                  <Th numeric>{t.filled}</Th>
                  <Th numeric>{t.declaredMissing}</Th>
                  <Th numeric>{t.notRecorded}</Th>
                </Tr>
              </THead>
              <TBody>
                {ordered.map((p) => (
                  <Tr key={p.slug}>
                    <RowHeader>{p.name}</RowHeader>
                    <Td numeric>
                      <div className="flex items-center justify-end gap-2">
                        <Bar
                          value={p.coverage.filled_pct === null ? null : p.coverage.filled_pct / 100}
                          color="bg-quality-medido"
                          className="h-1.5 w-16"
                        />
                        <span className="tabular-nums">
                          {p.coverage.filled_pct === null ? t.coverageEmpty : formatPercent(p.coverage.filled_pct)}
                        </span>
                      </div>
                    </Td>
                    <Td numeric className="tabular-nums">
                      {p.coverage.filled.toLocaleString("pt-BR")}
                    </Td>
                    <Td numeric className="tabular-nums">
                      {p.coverage.declared_missing.toLocaleString("pt-BR")}
                    </Td>
                    <Td numeric className="tabular-nums">
                      {p.coverage.not_recorded.toLocaleString("pt-BR")}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        </CardBody>
      </Card>
    </>
  );
}
