"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ApplicationArchetype,
  BatteryChemistry,
  BatteryComparisonRequest,
  PackDesignRequest,
  ThermalSafetyLevel,
} from "@/lib/types";
import {
  compareBatteries,
  designBatteryPack,
  listBatteryArchetypes,
  listBatteryChemistries,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  NumberInput,
  PageHeader,
  Section,
  Select,
  SelectOption,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
  Tabs,
  type TabItem,
} from "@/components/ui";
import { IconBattery } from "@/components/ui/icons";

const t = ptBR.battery;

type TabView = "design" | "compare";

const TAB_ITEMS: readonly TabItem<TabView>[] = [
  { id: "design", label: t.tabDesign },
  { id: "compare", label: t.tabCompare },
];

function safetyBadgeTone(level: ThermalSafetyLevel) {
  switch (level) {
    case "excellent":
      return "success";
    case "good":
      return "info";
    case "moderate":
      return "warning";
    case "poor":
      return "danger";
    default:
      return "neutral";
  }
}

function safetyBadgeLabel(level: ThermalSafetyLevel) {
  switch (level) {
    case "excellent":
      return "Excelente";
    case "good":
      return "Boa";
    case "moderate":
      return "Moderada";
    case "poor":
      return "Crítica";
    default:
      return level;
  }
}

function StatTile({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-card border p-3 ${
        highlight
          ? "border-brand-300 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/20"
          : "border-edge bg-surface-raised"
      }`}
    >
      <span className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-semibold tabular-nums text-ink">
          {value}
        </span>
        {unit ? <span className="text-xs text-ink-muted">{unit}</span> : null}
      </div>
    </div>
  );
}

export default function BateriasPage() {
  const chemistries = useQuery({
    queryKey: ["battery-chemistries"],
    queryFn: listBatteryChemistries,
  });

  const archetypes = useQuery({
    queryKey: ["battery-archetypes"],
    queryFn: listBatteryArchetypes,
  });

  // State: Brief inputs initialized with Urban EV defaults
  const [archetypeSlug, setArchetypeSlug] = useState<string>("ve-urbano");
  const [chemistrySlug, setChemistrySlug] = useState<string>("lfp");
  const [targetVoltage, setTargetVoltage] = useState<string>("400");
  const [targetEnergy, setTargetEnergy] = useState<string>("50");
  const [targetPower, setTargetPower] = useState<string>("120");
  const [dod, setDod] = useState<string>("0.85");
  const [cellCapacity, setCellCapacity] = useState<string>("");
  const [massPacking, setMassPacking] = useState<string>("0.65");
  const [volPacking, setVolPacking] = useState<string>("0.50");
  const [costPacking, setCostPacking] = useState<string>("0.70");

  const [activeTab, setActiveTab] = useState<TabView>("design");

  // Handle archetype preset selection
  const handleArchetypeChange = (slug: string) => {
    setArchetypeSlug(slug);
    if (!slug || slug === "custom") return;

    const chosen = archetypes.data?.find((a: ApplicationArchetype) => a.slug === slug);
    if (chosen) {
      setChemistrySlug(chosen.default_chemistry_slug);
      setTargetVoltage(String(chosen.target_voltage_v));
      setTargetEnergy(String(chosen.target_energy_kwh));
      setTargetPower(String(chosen.target_power_kw));
      setDod(String(chosen.dod));
      setCellCapacity("");
      setMassPacking(String(chosen.mass_packing_factor));
      setVolPacking(String(chosen.volume_packing_factor));
      setCostPacking(String(chosen.cost_packing_factor));
    }
  };

  // Readiness validation
  const ready = useMemo(() => {
    const v = Number(targetVoltage);
    const e = Number(targetEnergy);
    const p = Number(targetPower);
    const d = Number(dod);
    const fm = Number(massPacking);
    const fv = Number(volPacking);
    const fc = Number(costPacking);
    const cap = cellCapacity ? Number(cellCapacity) : null;

    return (
      Boolean(chemistrySlug) &&
      Number.isFinite(v) &&
      v > 0 &&
      Number.isFinite(e) &&
      e > 0 &&
      Number.isFinite(p) &&
      p > 0 &&
      Number.isFinite(d) &&
      d > 0 &&
      d <= 1 &&
      Number.isFinite(fm) &&
      fm > 0 &&
      fm <= 1 &&
      Number.isFinite(fv) &&
      fv > 0 &&
      fv <= 1 &&
      Number.isFinite(fc) &&
      fc > 0 &&
      fc <= 1 &&
      (cap === null || (Number.isFinite(cap) && cap > 0))
    );
  }, [
    chemistrySlug,
    targetVoltage,
    targetEnergy,
    targetPower,
    dod,
    massPacking,
    volPacking,
    costPacking,
    cellCapacity,
  ]);

  // Design query
  const designRequest = useMemo<PackDesignRequest | null>(() => {
    if (!ready) return null;
    return {
      chemistry_slug: chemistrySlug,
      target_voltage_v: Number(targetVoltage),
      target_energy_kwh: Number(targetEnergy),
      target_power_kw: Number(targetPower),
      dod: Number(dod),
      cell_capacity_ah: cellCapacity ? Number(cellCapacity) : null,
      mass_packing_factor: Number(massPacking),
      volume_packing_factor: Number(volPacking),
      cost_packing_factor: Number(costPacking),
    };
  }, [
    ready,
    chemistrySlug,
    targetVoltage,
    targetEnergy,
    targetPower,
    dod,
    cellCapacity,
    massPacking,
    volPacking,
    costPacking,
  ]);

  const designQuery = useQuery({
    queryKey: ["battery-design", designRequest],
    queryFn: () => (designRequest ? designBatteryPack(designRequest) : Promise.reject("Not ready")),
    enabled: Boolean(designRequest),
  });

  // Comparison query
  const comparisonRequest = useMemo<BatteryComparisonRequest | null>(() => {
    if (!ready) return null;
    return {
      target_voltage_v: Number(targetVoltage),
      target_energy_kwh: Number(targetEnergy),
      target_power_kw: Number(targetPower),
      dod: Number(dod),
      cell_capacity_ah: cellCapacity ? Number(cellCapacity) : null,
      mass_packing_factor: Number(massPacking),
      volume_packing_factor: Number(volPacking),
      cost_packing_factor: Number(costPacking),
    };
  }, [
    ready,
    targetVoltage,
    targetEnergy,
    targetPower,
    dod,
    cellCapacity,
    massPacking,
    volPacking,
    costPacking,
  ]);

  const comparisonQuery = useQuery({
    queryKey: ["battery-comparison", comparisonRequest],
    queryFn: () =>
      comparisonRequest ? compareBatteries(comparisonRequest) : Promise.reject("Not ready"),
    enabled: Boolean(comparisonRequest),
  });

  if (chemistries.isLoading || archetypes.isLoading) {
    return <LoadingState label={t.loading} />;
  }

  if (chemistries.isError) {
    return <ErrorState description={String(chemistries.error)} />;
  }

  if (archetypes.isError) {
    return <ErrorState description={String(archetypes.error)} />;
  }

  const design = designQuery.data;
  const comparison = comparisonQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
      />

      {/* Archetype and Requirements Section */}
      <Section
        title={t.archetypesTitle}
        description={t.archetypesHint}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label={t.archetypesTitle}
            value={archetypeSlug}
            onChange={(e) => handleArchetypeChange((e.target as HTMLSelectElement).value)}
          >
            <SelectOption value="custom">{t.customOption}</SelectOption>
            {(archetypes.data ?? []).map((arch: ApplicationArchetype) => (
              <SelectOption key={arch.slug} value={arch.slug}>
                {arch.name}
              </SelectOption>
            ))}
          </Select>

          <Select
            label={t.chemistryTitle}
            value={chemistrySlug}
            onChange={(e) => {
              setChemistrySlug((e.target as HTMLSelectElement).value);
              setArchetypeSlug("custom");
            }}
          >
            {(chemistries.data ?? []).map((chem: BatteryChemistry) => (
              <SelectOption key={chem.slug} value={chem.slug}>
                {chem.name} ({chem.cell_nominal_voltage_v} V)
              </SelectOption>
            ))}
          </Select>

          <NumberInput
            label={t.targetVoltage}
            value={targetVoltage}
            min={1}
            step="any"
            onChange={(e) => {
              setTargetVoltage((e.target as HTMLInputElement).value);
              setArchetypeSlug("custom");
            }}
          />

          <NumberInput
            label={t.targetEnergy}
            value={targetEnergy}
            min={0.01}
            step="any"
            onChange={(e) => {
              setTargetEnergy((e.target as HTMLInputElement).value);
              setArchetypeSlug("custom");
            }}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberInput
            label={t.targetPower}
            value={targetPower}
            min={0.1}
            step="any"
            onChange={(e) => {
              setTargetPower((e.target as HTMLInputElement).value);
              setArchetypeSlug("custom");
            }}
          />

          <NumberInput
            label={t.dod}
            value={dod}
            min={0.1}
            max={1.0}
            step={0.05}
            hint="Fração recomendada 0.8 a 0.9"
            onChange={(e) => {
              setDod((e.target as HTMLInputElement).value);
              setArchetypeSlug("custom");
            }}
          />

          <NumberInput
            label={t.cellCapacity}
            value={cellCapacity}
            min={0.1}
            step="any"
            hint="Vazio = padrão da química"
            onChange={(e) => {
              setCellCapacity((e.target as HTMLInputElement).value);
              setArchetypeSlug("custom");
            }}
          />

          <NumberInput
            label={t.massPackingFactor}
            value={massPacking}
            min={0.1}
            max={1.0}
            step={0.05}
            hint="Massa células / pack (ex.: 0.65)"
            onChange={(e) => {
              setMassPacking((e.target as HTMLInputElement).value);
              setArchetypeSlug("custom");
            }}
          />
        </div>
      </Section>

      {/* Tabs navigation */}
      <Tabs
        label={t.title}
        items={TAB_ITEMS}
        value={activeTab}
        onChange={setActiveTab}
        panelClassName="flex flex-col gap-4 pt-2"
      >
        {/* Tab 1: Pack Sizing */}
        {activeTab === "design" && (
          <>
            {!ready && <EmptyState title={t.empty} />}
            {designQuery.isLoading && ready && <LoadingState label={t.loading} />}
            {designQuery.isError && (
              <ErrorState
                title={t.error}
                description={
                  designQuery.error instanceof Error
                    ? designQuery.error.message
                    : String(designQuery.error)
                }
              />
            )}

            {design && (
              <div className="flex flex-col gap-6">
                {/* Hero Architecture Card */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconBattery className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                      <h3 className="text-base font-semibold text-ink">
                        {t.packArchitecture} ({design.chemistry.name})
                      </h3>
                    </div>
                    <Badge tone={safetyBadgeTone(design.thermal_safety)}>
                      {t.thermalTitle}: {safetyBadgeLabel(design.thermal_safety)}
                    </Badge>
                  </CardHeader>
                  <CardBody className="flex flex-col gap-6">
                    {/* Big Ns x Np visual banner */}
                    <div className="flex flex-wrap items-center justify-around gap-4 rounded-xl border border-edge bg-surface-sunken p-4 text-center">
                      <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-wider text-ink-muted">
                          {t.seriesLabel}
                        </span>
                        <span className="text-3xl font-bold tabular-nums text-brand-600 dark:text-brand-400">
                          {design.series_cells_ns}
                        </span>
                        <span className="text-2xs text-ink-subtle">
                          em série ({formatNumber(design.nominal_voltage_v)} V)
                        </span>
                      </div>

                      <span className="text-2xl font-light text-ink-subtle">×</span>

                      <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-wider text-ink-muted">
                          {t.parallelLabel}
                        </span>
                        <span className="text-3xl font-bold tabular-nums text-brand-600 dark:text-brand-400">
                          {design.parallel_strings_np}
                        </span>
                        <span className="text-2xs text-ink-subtle">
                          em paralelo ({formatNumber(design.pack_capacity_ah)} Ah)
                        </span>
                      </div>

                      <span className="text-2xl font-light text-ink-subtle">=</span>

                      <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-wider text-ink-muted">
                          {t.totalCellsLabel}
                        </span>
                        <span className="text-3xl font-bold tabular-nums text-ink">
                          {formatNumber(design.total_cells)}
                        </span>
                        <span className="text-2xs text-ink-subtle">células unitárias</span>
                      </div>
                    </div>

                    {/* Technical stats grid */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <StatTile
                        label={t.usableEnergyLabel}
                        value={formatNumber(design.usable_energy_kwh)}
                        unit="kWh"
                        highlight
                      />
                      <StatTile
                        label={t.grossEnergyLabel}
                        value={formatNumber(design.gross_energy_kwh)}
                        unit="kWh"
                      />
                      <StatTile
                        label={t.peakPower}
                        value={formatNumber(design.peak_power_kw)}
                        unit="kW"
                      />
                      <StatTile
                        label={t.cRate}
                        value={`${formatNumber(design.max_continuous_discharge_c_rate)}C`}
                        unit="1/h"
                      />
                    </div>
                  </CardBody>
                </Card>

                {/* Mass & Volume Breakdown */}
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <h4 className="text-sm font-semibold text-ink">
                        {t.massBreakdown}
                      </h4>
                    </CardHeader>
                    <CardBody className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <StatTile
                          label={t.cellsMass}
                          value={formatNumber(design.cells_mass_kg)}
                          unit="kg"
                        />
                        <StatTile
                          label={t.overheadMass}
                          value={formatNumber(design.mass_overhead_kg)}
                          unit="kg"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <StatTile
                          label={t.totalPackMass}
                          value={formatNumber(design.pack_mass_kg)}
                          unit="kg"
                          highlight
                        />
                        <StatTile
                          label={t.specificEnergy}
                          value={formatNumber(design.pack_specific_energy_wh_kg)}
                          unit="Wh/kg"
                        />
                      </div>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader>
                      <h4 className="text-sm font-semibold text-ink">
                        Volume e Densidade Energética
                      </h4>
                    </CardHeader>
                    <CardBody className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <StatTile
                          label="Volume das células"
                          value={formatNumber(design.cells_volume_l)}
                          unit="L"
                        />
                        <StatTile
                          label="Sobrecarga volumétrica"
                          value={formatNumber(design.volume_overhead_l)}
                          unit="L"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <StatTile
                          label="Volume total do pack"
                          value={formatNumber(design.pack_volume_l)}
                          unit="L"
                          highlight
                        />
                        <StatTile
                          label={t.energyDensity}
                          value={formatNumber(design.pack_energy_density_wh_l)}
                          unit="Wh/L"
                        />
                      </div>
                    </CardBody>
                  </Card>
                </div>

                {/* Economic & Lifetime Breakdown */}
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <h4 className="text-sm font-semibold text-ink">
                        {t.costBreakdown}
                      </h4>
                    </CardHeader>
                    <CardBody className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <StatTile
                          label={t.cellCost}
                          value={`US$ ${formatNumber(design.cell_cost_total_usd)}`}
                        />
                        <StatTile
                          label={t.overheadCost}
                          value={`US$ ${formatNumber(design.cost_overhead_usd)}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <StatTile
                          label={t.totalCost}
                          value={`US$ ${formatNumber(design.pack_cost_total_usd)}`}
                          highlight
                        />
                        <StatTile
                          label={t.levelizedCost}
                          value={`US$ ${design.levelized_cost_per_kwh_cycle.toFixed(4)}`}
                          unit="/kWh·ciclo"
                        />
                      </div>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader>
                      <h4 className="text-sm font-semibold text-ink">
                        {t.thermalTitle}
                      </h4>
                    </CardHeader>
                    <CardBody className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <StatTile
                          label={t.thermalRunaway}
                          value={`${formatNumber(design.chemistry.thermal_runaway_temp_c)} °C`}
                        />
                        <StatTile
                          label={t.operatingRange}
                          value={`${design.chemistry.temp_range_min_c} a ${design.chemistry.temp_range_max_c} °C`}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 rounded-lg bg-surface-sunken p-3">
                        <span className="text-xs font-semibold text-ink">
                          Diretrizes de Gerenciamento Térmico:
                        </span>
                        <ul className="list-inside list-disc text-xs text-ink-muted">
                          {design.thermal_guidelines.map((guide, idx) => (
                            <li key={idx}>{guide}</li>
                          ))}
                        </ul>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab 2: Chemistry Trade-offs */}
        {activeTab === "compare" && (
          <>
            {!ready && <EmptyState title={t.empty} />}
            {comparisonQuery.isLoading && ready && <LoadingState label={t.loading} />}
            {comparisonQuery.isError && (
              <ErrorState
                title={t.error}
                description={
                  comparisonQuery.error instanceof Error
                    ? comparisonQuery.error.message
                    : String(comparisonQuery.error)
                }
              />
            )}

            {comparison && (
              <div className="flex flex-col gap-6">
                {/* Podiums / Dominance Badges */}
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-semibold text-ink">
                      Destaques de Dominância Eletroquímica
                    </h3>
                  </CardHeader>
                  <CardBody>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="flex flex-col gap-1 rounded-card border border-edge bg-surface-raised p-3">
                        <Badge tone="success">{t.lightestBadge}</Badge>
                        <span className="text-sm font-semibold text-ink">
                          {comparison.items.find((i) => i.chemistry_slug === comparison.lightest_slug)?.chemistry_name}
                        </span>
                        <span className="text-xs text-ink-muted">
                          Massa: {formatNumber(comparison.items.find((i) => i.chemistry_slug === comparison.lightest_slug)?.pack_mass_kg ?? 0)} kg
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 rounded-card border border-edge bg-surface-raised p-3">
                        <Badge tone="info">{t.compactBadge}</Badge>
                        <span className="text-sm font-semibold text-ink">
                          {comparison.items.find((i) => i.chemistry_slug === comparison.most_compact_slug)?.chemistry_name}
                        </span>
                        <span className="text-xs text-ink-muted">
                          Volume: {formatNumber(comparison.items.find((i) => i.chemistry_slug === comparison.most_compact_slug)?.pack_volume_l ?? 0)} L
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 rounded-card border border-edge bg-surface-raised p-3">
                        <Badge tone="brand">{t.cheapestBadge}</Badge>
                        <span className="text-sm font-semibold text-ink">
                          {comparison.items.find((i) => i.chemistry_slug === comparison.lowest_upfront_cost_slug)?.chemistry_name}
                        </span>
                        <span className="text-xs text-ink-muted">
                          Custo inicial: US$ {formatNumber(comparison.items.find((i) => i.chemistry_slug === comparison.lowest_upfront_cost_slug)?.pack_cost_usd ?? 0)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 rounded-card border border-edge bg-surface-raised p-3">
                        <Badge tone="brand">{t.durableBadge}</Badge>
                        <span className="text-sm font-semibold text-ink">
                          {comparison.items.find((i) => i.chemistry_slug === comparison.most_durable_slug)?.chemistry_name}
                        </span>
                        <span className="text-xs text-ink-muted">
                          Vida útil: {formatNumber(comparison.items.find((i) => i.chemistry_slug === comparison.most_durable_slug)?.cycle_life ?? 0)} ciclos
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 rounded-card border border-edge bg-surface-raised p-3">
                        <Badge tone="success">{t.levelizedBadge}</Badge>
                        <span className="text-sm font-semibold text-ink">
                          {comparison.items.find((i) => i.chemistry_slug === comparison.lowest_levelized_cost_slug)?.chemistry_name}
                        </span>
                        <span className="text-xs text-ink-muted">
                          Custo nivelado: US$ {(comparison.items.find((i) => i.chemistry_slug === comparison.lowest_levelized_cost_slug)?.levelized_cost_per_kwh_cycle ?? 0).toFixed(4)}/kWh·ciclo
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 rounded-card border border-edge bg-surface-raised p-3">
                        <Badge tone="success">{t.safestBadge}</Badge>
                        <span className="text-sm font-semibold text-ink">
                          {comparison.items.find((i) => i.chemistry_slug === comparison.safest_slug)?.chemistry_name}
                        </span>
                        <span className="text-xs text-ink-muted">
                          Segurança térmica máxima
                        </span>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Full Comparative Table */}
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-semibold text-ink">
                      Tabela Comparativa de Químicas para os Requisitos
                    </h3>
                  </CardHeader>
                  <TableScroll>
                    <Table>
                      <TableCaption>
                        Comparativo determinístico das 9 químicas eletroquímicas para {targetEnergy} kWh e {targetPower} kW.
                      </TableCaption>
                      <THead>
                        <Tr>
                          <Th scope="col">{t.tableColChem}</Th>
                          <Th scope="col">{t.tableColNsNp}</Th>
                          <Th scope="col">{t.tableColMass}</Th>
                          <Th scope="col">{t.tableColVol}</Th>
                          <Th scope="col">{t.tableColCost}</Th>
                          <Th scope="col">{t.tableColLife}</Th>
                          <Th scope="col">{t.tableColLevelized}</Th>
                          <Th scope="col">{t.tableColSafety}</Th>
                        </Tr>
                      </THead>
                      <TBody>
                        {comparison.items.map((item) => {
                          const isSelected = item.chemistry_slug === chemistrySlug;
                          return (
                            <Tr
                              key={item.chemistry_slug}
                              className={isSelected ? "bg-brand-50/40 dark:bg-brand-950/20 font-medium" : undefined}
                            >
                              <Td>
                                <div className="flex items-center gap-2">
                                  <span>{item.chemistry_name}</span>
                                  {isSelected ? (
                                    <Badge tone="brand">Selecionada</Badge>
                                  ) : null}
                                </div>
                              </Td>
                              <Td className="tabular-nums">
                                {item.series_cells_ns}s {item.parallel_strings_np}p ({formatNumber(item.total_cells)})
                              </Td>
                              <Td className="tabular-nums">
                                {formatNumber(item.pack_mass_kg)} kg
                              </Td>
                              <Td className="tabular-nums">
                                {formatNumber(item.pack_volume_l)} L
                              </Td>
                              <Td className="tabular-nums">
                                US$ {formatNumber(item.pack_cost_usd)}
                              </Td>
                              <Td className="tabular-nums">
                                {formatNumber(item.cycle_life)}
                              </Td>
                              <Td className="tabular-nums">
                                US$ {item.levelized_cost_per_kwh_cycle.toFixed(4)}
                              </Td>
                              <Td>
                                <Badge tone={safetyBadgeTone(item.thermal_safety)}>
                                  {safetyBadgeLabel(item.thermal_safety)}
                                </Badge>
                              </Td>
                            </Tr>
                          );
                        })}
                      </TBody>
                    </Table>
                  </TableScroll>
                </Card>

                {/* Technical Summary */}
                <Alert tone="info" title={t.summaryTitle}>
                  {comparison.technical_summary}
                </Alert>
              </div>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
