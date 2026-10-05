"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  EcoAuditResult,
  EcoComparisonResult,
  EcoDominance,
  EcoPhase,
  UseModel,
} from "@/lib/types";
import {
  listMaterials,
  listTransportModes,
  runEcoAudit,
  compareEcoAudits,
  getMaterial,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import { PhaseBars, type PhaseBarRow } from "@/components/eco/PhaseBars";
import {
  Alert,
  Badge,
  Button,
  Combobox,
  Disclosure,
  EmptyState,
  ErrorState,
  LoadingState,
  NumberInput,
  PageHeader,
  Select,
  SelectOption,
  StepCard,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";

const t = ptBR.eco;

const DEFAULTS = {
  recycled: "0",
  distance: "1500",
  power: "60",
  duty: "0.25",
  life: "10",
  travel: "200000",
  intensity: "0.0025",
  carbonPerEnergy: "0.07",
};

function printable(raw: string): string {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) ? formatNumber(value) : raw || "…";
}

function Quantity({
  value,
  reason,
}: {
  value: number | null;
  reason: string | null;
}) {
  if (value !== null) {
    return <span className="tabular-nums">{formatNumber(value)}</span>;
  }
  return (
    <span className="text-xs text-ink-muted">{reason ?? "Não calculada"}</span>
  );
}

function Podium({
  label,
  dominance,
}: {
  label: string;
  dominance: EcoDominance;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-muted">
        {label}
      </span>
      {dominance.phase ? (
        <span className="text-sm text-ink">
          <strong>{dominance.label}</strong>
          {dominance.share !== null ? (
            <>
              {" "}
              — {formatNumber(dominance.share * 100)}% {t.dominanceShare}
            </>
          ) : null}
        </span>
      ) : (
        <span className="text-sm text-ink-muted">{dominance.refusal}</span>
      )}
    </div>
  );
}

function PhaseTable({ result }: { result: EcoAuditResult }) {
  if (result.phases.length === 0) {
    return <EmptyState title={t.resultStep} />;
  }
  return (
    <TableScroll label={t.resultStep}>
      <Table>
        <TableCaption>{result.carbon_unit_note}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnPhase}</Th>
            <Th scope="col">{`${t.columnEnergy} (${result.energy_unit})`}</Th>
            <Th scope="col">{`${t.columnCarbon} (${result.carbon_unit})`}</Th>
            <Th scope="col">{t.columnDetail}</Th>
          </Tr>
        </THead>
        <TBody>
          {result.phases.map((phase: EcoPhase) => (
            <Tr key={phase.phase}>
              <Td className="font-medium">{phase.label}</Td>
              <Td>
                <Quantity value={phase.energy} reason={phase.energy_reason} />
              </Td>
              <Td>
                <Quantity value={phase.carbon} reason={phase.carbon_reason} />
              </Td>
              <Td className="text-xs text-ink-muted">{phase.detail}</Td>
            </Tr>
          ))}
          <Tr>
            <Td className="font-medium">{t.totalLabel}</Td>
            <Td>
              <Quantity value={result.total_energy} reason={t.noTotal} />
            </Td>
            <Td>
              <Quantity value={result.total_carbon} reason={t.noTotal} />
            </Td>
            <Td />
          </Tr>
        </TBody>
      </Table>
    </TableScroll>
  );
}

function ComparisonTable({ result }: { result: EcoComparisonResult }) {
  const resA = result.material_a;
  const resB = result.material_b;
  const energyUnit = resA.energy_unit;
  const carbonUnit = resA.carbon_unit;

  const phases = resA.phases.map((pA) => {
    const pB = resB.phases.find((p) => p.phase === pA.phase);
    return {
      phase: pA.phase,
      label: pA.label,
      energyA: pA.energy,
      energyB: pB?.energy ?? null,
      carbonA: pA.carbon,
      carbonB: pB?.carbon ?? null,
    };
  });

  return (
    <TableScroll label={t.compareResultStep}>
      <Table>
        <TableCaption>{resA.carbon_unit_note}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnPhase}</Th>
            <Th scope="col">{`${t.columnMaterialA} (${resA.material_name})`}</Th>
            <Th scope="col">{`${t.columnMaterialB} (${resB.material_name})`}</Th>
            <Th scope="col">{t.columnVariation}</Th>
          </Tr>
        </THead>
        <TBody>
          {phases.map((p) => {
            const deltaE = p.energyA !== null && p.energyB !== null ? p.energyB - p.energyA : null;
            const deltaC = p.carbonA !== null && p.carbonB !== null ? p.carbonB - p.carbonA : null;
            return (
              <Tr key={p.phase}>
                <Td className="font-medium">{p.label}</Td>
                <Td className="tabular-nums text-xs">
                  <div>
                    {p.energyA !== null ? `${formatNumber(p.energyA)} ${energyUnit}` : "—"}
                  </div>
                  <div className="text-ink-muted">
                    {p.carbonA !== null ? `${formatNumber(p.carbonA)} ${carbonUnit}` : "—"}
                  </div>
                </Td>
                <Td className="tabular-nums text-xs">
                  <div>
                    {p.energyB !== null ? `${formatNumber(p.energyB)} ${energyUnit}` : "—"}
                  </div>
                  <div className="text-ink-muted">
                    {p.carbonB !== null ? `${formatNumber(p.carbonB)} ${carbonUnit}` : "—"}
                  </div>
                </Td>
                <Td className="tabular-nums text-xs">
                  <div className={deltaE !== null ? (deltaE < 0 ? "text-success-fg font-medium" : deltaE > 0 ? "text-danger-fg" : "text-ink-muted") : "text-ink-muted"}>
                    {deltaE !== null ? `${deltaE > 0 ? "+" : ""}${formatNumber(deltaE)} ${energyUnit}` : "—"}
                  </div>
                  <div className={deltaC !== null ? (deltaC < 0 ? "text-success-fg font-medium" : deltaC > 0 ? "text-danger-fg" : "text-ink-muted") : "text-ink-muted"}>
                    {deltaC !== null ? `${deltaC > 0 ? "+" : ""}${formatNumber(deltaC)} ${carbonUnit}` : "—"}
                  </div>
                </Td>
              </Tr>
            );
          })}
          <Tr>
            <Td className="font-medium">{t.totalLabel}</Td>
            <Td className="tabular-nums font-semibold text-xs">
              <div>
                {resA.total_energy !== null ? `${formatNumber(resA.total_energy)} ${energyUnit}` : "—"}
              </div>
              <div className="text-ink-muted">
                {resA.total_carbon !== null ? `${formatNumber(resA.total_carbon)} ${carbonUnit}` : "—"}
              </div>
            </Td>
            <Td className="tabular-nums font-semibold text-xs">
              <div>
                {resB.total_energy !== null ? `${formatNumber(resB.total_energy)} ${energyUnit}` : "—"}
              </div>
              <div className="text-ink-muted">
                {resB.total_carbon !== null ? `${formatNumber(resB.total_carbon)} ${carbonUnit}` : "—"}
              </div>
            </Td>
            <Td className="tabular-nums font-semibold text-xs">
              <div className={result.delta_energy !== null ? (result.delta_energy < 0 ? "text-success-fg" : result.delta_energy > 0 ? "text-danger-fg" : "text-ink-muted") : "text-ink-muted"}>
                {result.delta_energy !== null
                  ? `${result.delta_energy > 0 ? "+" : ""}${formatNumber(result.delta_energy)} ${energyUnit} (${result.delta_energy_percent !== null ? (result.delta_energy_percent > 0 ? "+" : "") + formatNumber(result.delta_energy_percent) + "%" : ""})`
                  : "—"}
              </div>
              <div className={result.delta_carbon !== null ? (result.delta_carbon < 0 ? "text-success-fg" : result.delta_carbon > 0 ? "text-danger-fg" : "text-ink-muted") : "text-ink-muted"}>
                {result.delta_carbon !== null
                  ? `${result.delta_carbon > 0 ? "+" : ""}${formatNumber(result.delta_carbon)} ${carbonUnit} (${result.delta_carbon_percent !== null ? (result.delta_carbon_percent > 0 ? "+" : "") + formatNumber(result.delta_carbon_percent) + "%" : ""})`
                  : "—"}
              </div>
            </Td>
          </Tr>
        </TBody>
      </Table>
    </TableScroll>
  );
}

export default function EcoPage() {
  const params = useSearchParams();
  const materials = useQuery({
    queryKey: ["materials"],
    queryFn: () => listMaterials(),
  });
  const modes = useQuery({
    queryKey: ["transport-modes"],
    queryFn: listTransportModes,
  });

  const [modeChoice, setModeChoice] = useState<"individual" | "compare">("individual");

  // Individual mode state
  const [materialId, setMaterialId] = useState(params.get("material") ?? "");
  const [mass, setMass] = useState(params.get("massa") ?? "");
  const [recycled, setRecycled] = useState(DEFAULTS.recycled);
  const [processId, setProcessId] = useState("");
  const [endOfLife, setEndOfLife] = useState("reciclagem");
  const [result, setResult] = useState<EcoAuditResult | null>(null);

  // Compare mode state
  const [materialAId, setMaterialAId] = useState("");
  const [massA, setMassA] = useState(params.get("massa") ?? "1");
  const [recycledA, setRecycledA] = useState(DEFAULTS.recycled);
  const [processAId, setProcessAId] = useState("");
  const [endOfLifeA, setEndOfLifeA] = useState("reciclagem");

  const [materialBId, setMaterialBId] = useState("");
  const [massB, setMassB] = useState("1");
  const [recycledB, setRecycledB] = useState(DEFAULTS.recycled);
  const [processBId, setProcessBId] = useState("");
  const [endOfLifeB, setEndOfLifeB] = useState("reciclagem");
  const [compareResult, setCompareResult] = useState<EcoComparisonResult | null>(null);

  // Shared premises state
  const [mode, setMode] = useState("");
  const [distance, setDistance] = useState(DEFAULTS.distance);
  const [useModel, setUseModel] = useState<UseModel>("movel");
  const [power, setPower] = useState(DEFAULTS.power);
  const [duty, setDuty] = useState(DEFAULTS.duty);
  const [life, setLife] = useState(DEFAULTS.life);
  const [travel, setTravel] = useState(DEFAULTS.travel);
  const [intensity, setIntensity] = useState(DEFAULTS.intensity);
  const [carbonPerEnergy, setCarbonPerEnergy] = useState(DEFAULTS.carbonPerEnergy);
  const [premisesOpen, setPremisesOpen] = useState(false);

  const selectedMaterial = materialId || String(materials.data?.[0]?.id ?? "");
  const selectedMode = mode || modes.data?.[0]?.slug || "";

  const detail = useQuery({
    queryKey: ["material", selectedMaterial],
    queryFn: () => getMaterial(Number(selectedMaterial)),
    enabled: selectedMaterial !== "",
  });
  const processes = useMemo(() => detail.data?.processes ?? [], [detail.data]);
  const selectedProcess = processId || String(processes[0]?.id ?? "");

  // Compare mode materials & processes
  const selectedMatA = materialAId || String(materials.data?.[0]?.id ?? "");
  const detailA = useQuery({
    queryKey: ["material", selectedMatA],
    queryFn: () => getMaterial(Number(selectedMatA)),
    enabled: modeChoice === "compare" && selectedMatA !== "",
  });
  const processesA = useMemo(() => detailA.data?.processes ?? [], [detailA.data]);
  const selectedProcA = processAId || String(processesA[0]?.id ?? "");

  const selectedMatB = materialBId || String(materials.data?.[1]?.id ?? materials.data?.[0]?.id ?? "");
  const detailB = useQuery({
    queryKey: ["material", selectedMatB],
    queryFn: () => getMaterial(Number(selectedMatB)),
    enabled: modeChoice === "compare" && selectedMatB !== "",
  });
  const processesB = useMemo(() => detailB.data?.processes ?? [], [detailB.data]);
  const selectedProcB = processBId || String(processesB[0]?.id ?? "");

  const audit = useMutation({
    mutationFn: () =>
      runEcoAudit({
        material_id: Number(selectedMaterial),
        process_id: Number(selectedProcess),
        part_mass: Number(mass),
        recycled_fraction: Number(recycled),
        transport_mode: selectedMode,
        transport_distance_km: Number(distance),
        end_of_life: endOfLife as "reciclagem" | "aterro" | "incineracao",
        use:
          useModel === "estatico"
            ? {
                model: "estatico",
                power_watts: Number(power),
                duty_cycle: Number(duty),
                life_years: Number(life),
                carbon_per_energy: Number(carbonPerEnergy),
              }
            : {
                model: "movel",
                distance_km: Number(travel),
                mobile_intensity: Number(intensity),
                life_years: Number(life),
                carbon_per_energy: Number(carbonPerEnergy),
              },
      }),
    onSuccess: setResult,
  });

  const comparisonMutation = useMutation({
    mutationFn: () =>
      compareEcoAudits({
        material_a: {
          material_id: Number(selectedMatA),
          process_id: Number(selectedProcA),
          part_mass: Number(massA),
          recycled_fraction: Number(recycledA),
          end_of_life: endOfLifeA as "reciclagem" | "aterro" | "incineracao",
        },
        material_b: {
          material_id: Number(selectedMatB),
          process_id: Number(selectedProcB),
          part_mass: Number(massB),
          recycled_fraction: Number(recycledB),
          end_of_life: endOfLifeB as "reciclagem" | "aterro" | "incineracao",
        },
        transport_mode: selectedMode,
        transport_distance_km: Number(distance),
        use:
          useModel === "estatico"
            ? {
                model: "estatico",
                power_watts: Number(power),
                duty_cycle: Number(duty),
                life_years: Number(life),
                carbon_per_energy: Number(carbonPerEnergy),
              }
            : {
                model: "movel",
                distance_km: Number(travel),
                mobile_intensity: Number(intensity),
                life_years: Number(life),
                carbon_per_energy: Number(carbonPerEnergy),
              },
      }),
    onSuccess: setCompareResult,
  });

  const blocked = useMemo((): { reason: string; inPremises: boolean } | null => {
    const positive = (raw: string) => {
      const value = Number(raw);
      return raw.trim() !== "" && Number.isFinite(value) && value > 0;
    };
    if (selectedMode === "") return { reason: t.blocked.mode, inPremises: false };
    if (!positive(distance))
      return { reason: t.blocked.positive(t.transportDistanceLabel), inPremises: false };
    const premises: [string, string][] =
      useModel === "estatico"
        ? [
            [life, t.lifeLabel],
            [power, t.powerLabel],
          ]
        : [
            [life, t.lifeLabel],
            [travel, t.travelLabel],
            [intensity, t.intensityLabel],
          ];
    for (const [raw, label] of premises) {
      if (!positive(raw)) return { reason: t.blocked.positive(label), inPremises: true };
    }
    if (useModel === "estatico" && (!positive(duty) || Number(duty) > 1))
      return { reason: t.blocked.duty, inPremises: true };
    if (!positive(carbonPerEnergy))
      return { reason: t.blocked.positive(t.carbonPerEnergyLabel), inPremises: true };

    if (modeChoice === "individual") {
      if (selectedMaterial === "" || selectedProcess === "")
        return { reason: t.blocked.process, inPremises: false };
      if (!positive(mass)) return { reason: t.blocked.mass, inPremises: false };
      const recycledValue = Number(recycled);
      if (recycled.trim() === "" || !(recycledValue >= 0 && recycledValue <= 1))
        return { reason: t.blocked.recycled, inPremises: false };
    } else {
      if (selectedMatA === "" || selectedProcA === "")
        return { reason: `${t.materialA}: ${t.blocked.process}`, inPremises: false };
      if (!positive(massA))
        return { reason: `${t.materialA}: ${t.blocked.mass}`, inPremises: false };
      const recA = Number(recycledA);
      if (recycledA.trim() === "" || !(recA >= 0 && recA <= 1))
        return { reason: `${t.materialA}: ${t.blocked.recycled}`, inPremises: false };

      if (selectedMatB === "" || selectedProcB === "")
        return { reason: `${t.materialB}: ${t.blocked.process}`, inPremises: false };
      if (!positive(massB))
        return { reason: `${t.materialB}: ${t.blocked.mass}`, inPremises: false };
      const recB = Number(recycledB);
      if (recycledB.trim() === "" || !(recB >= 0 && recB <= 1))
        return { reason: `${t.materialB}: ${t.blocked.recycled}`, inPremises: false };
    }
    return null;
  }, [
    modeChoice,
    selectedMaterial,
    selectedProcess,
    selectedMatA,
    selectedProcA,
    selectedMatB,
    selectedProcB,
    selectedMode,
    mass,
    massA,
    massB,
    recycled,
    recycledA,
    recycledB,
    distance,
    life,
    carbonPerEnergy,
    useModel,
    power,
    duty,
    travel,
    intensity,
  ]);

  const ready = blocked === null;

  const materialOptions = useMemo(
    () =>
      (materials.data ?? []).map((material) => ({
        value: String(material.id),
        label: material.name,
        description: material.class_name,
        keywords: [material.class_name],
      })),
    [materials.data],
  );

  // Phase bar rows (Individual mode)
  const energyRows: PhaseBarRow[] = useMemo(
    () =>
      (result?.phases ?? []).map((p) => ({
        phase: p.phase,
        label: p.label,
        items: [
          {
            seriesName: result?.material_name ?? ecoPhaseI18n.impactLabel,
            value: p.energy,
            reason: p.energy_reason,
            tone: "primary",
          },
        ],
      })),
    [result],
  );

  const carbonRows: PhaseBarRow[] = useMemo(
    () =>
      (result?.phases ?? []).map((p) => ({
        phase: p.phase,
        label: p.label,
        items: [
          {
            seriesName: result?.material_name ?? ecoPhaseI18n.impactLabel,
            value: p.carbon,
            reason: p.carbon_reason,
            tone: "primary",
          },
        ],
      })),
    [result],
  );

  // Phase bar rows (Compare mode)
  const compareEnergyRows: PhaseBarRow[] = useMemo(() => {
    if (!compareResult) return [];
    const resA = compareResult.material_a;
    const resB = compareResult.material_b;
    return resA.phases.map((pA) => {
      const pB = resB.phases.find((p) => p.phase === pA.phase);
      return {
        phase: pA.phase,
        label: pA.label,
        items: [
          {
            seriesName: resA.material_name,
            value: pA.energy,
            reason: pA.energy_reason,
            tone: "primary",
          },
          {
            seriesName: resB.material_name,
            value: pB?.energy ?? null,
            reason: pB?.energy_reason,
            tone: "secondary",
          },
        ],
      };
    });
  }, [compareResult]);

  const compareCarbonRows: PhaseBarRow[] = useMemo(() => {
    if (!compareResult) return [];
    const resA = compareResult.material_a;
    const resB = compareResult.material_b;
    return resA.phases.map((pA) => {
      const pB = resB.phases.find((p) => p.phase === pA.phase);
      return {
        phase: pA.phase,
        label: pA.label,
        items: [
          {
            seriesName: resA.material_name,
            value: pA.carbon,
            reason: pA.carbon_reason,
            tone: "primary",
          },
          {
            seriesName: resB.material_name,
            value: pB?.carbon ?? null,
            reason: pB?.carbon_reason,
            tone: "secondary",
          },
        ],
      };
    });
  }, [compareResult]);

  if (materials.isLoading || modes.isLoading)
    return <LoadingState label={t.title} />;
  if (materials.isError)
    return <ErrorState description={String(materials.error)} />;
  if (modes.isError) return <ErrorState description={String(modes.error)} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={modeChoice === "individual" ? "primary" : "secondary"}
          onClick={() => setModeChoice("individual")}
        >
          {t.modeIndividual}
        </Button>
        <Button
          size="sm"
          variant={modeChoice === "compare" ? "primary" : "secondary"}
          onClick={() => setModeChoice("compare")}
        >
          {t.modeCompare}
        </Button>
      </div>

      {modeChoice === "individual" ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <StepCard title={t.briefStep} bodyClassName="grid gap-4 sm:grid-cols-2">
            <Combobox
              label={t.materialLabel}
              hint={t.materialHint}
              options={materialOptions}
              value={selectedMaterial}
              onChange={(value) => {
                setMaterialId(value);
                setProcessId("");
              }}
            />
            {detail.isSuccess && processes.length === 0 ? (
              <div className="flex flex-col gap-1">
                <span className="msds-field-label">{t.processLabel}</span>
                <Alert tone="warning">{t.noProcess}</Alert>
              </div>
            ) : (
              <Select
                label={t.processLabel}
                hint={t.processHint}
                value={selectedProcess}
                disabled={processes.length === 0}
                onChange={(event) =>
                  setProcessId((event.target as HTMLSelectElement).value)
                }
              >
                {processes.map((process) => (
                  <SelectOption key={process.id} value={String(process.id)}>
                    {process.name}
                  </SelectOption>
                ))}
              </Select>
            )}
            <NumberInput
              label={t.massLabel}
              hint={t.massHint}
              value={mass}
              min={0}
              step="any"
              onChange={(event) => setMass(event.target.value)}
            />
            <NumberInput
              label={t.recycledLabel}
              hint={t.recycledHint}
              value={recycled}
              min={0}
              max={1}
              step="any"
              onChange={(event) => setRecycled(event.target.value)}
            />
          </StepCard>

          <StepCard
            title={t.transportStep}
            description={t.transportHint}
            bodyClassName="grid gap-4 sm:grid-cols-2"
          >
            <Select
              label={t.transportModeLabel}
              value={selectedMode}
              onChange={(event) =>
                setMode((event.target as HTMLSelectElement).value)
              }
            >
              {(modes.data ?? []).map((item) => (
                <SelectOption key={item.slug} value={item.slug}>
                  {item.name}
                </SelectOption>
              ))}
            </Select>
            <NumberInput
              label={t.transportDistanceLabel}
              value={distance}
              min={0}
              step="any"
              onChange={(event) => setDistance(event.target.value)}
            />
          </StepCard>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <StepCard title={t.materialA} bodyClassName="grid gap-4 sm:grid-cols-2">
            <Combobox
              label={t.materialLabel}
              hint={t.materialHint}
              options={materialOptions}
              value={selectedMatA}
              onChange={(value) => {
                setMaterialAId(value);
                setProcessAId("");
              }}
            />
            {detailA.isSuccess && processesA.length === 0 ? (
              <div className="flex flex-col gap-1">
                <span className="msds-field-label">{t.processLabel}</span>
                <Alert tone="warning">{t.noProcess}</Alert>
              </div>
            ) : (
              <Select
                label={t.processLabel}
                hint={t.processHint}
                value={selectedProcA}
                disabled={processesA.length === 0}
                onChange={(event) =>
                  setProcessAId((event.target as HTMLSelectElement).value)
                }
              >
                {processesA.map((process) => (
                  <SelectOption key={process.id} value={String(process.id)}>
                    {process.name}
                  </SelectOption>
                ))}
              </Select>
            )}
            <NumberInput
              label={t.massLabel}
              hint={t.massHint}
              value={massA}
              min={0}
              step="any"
              onChange={(event) => setMassA(event.target.value)}
            />
            <NumberInput
              label={t.recycledLabel}
              hint={t.recycledHint}
              value={recycledA}
              min={0}
              max={1}
              step="any"
              onChange={(event) => setRecycledA(event.target.value)}
            />
            <div className="sm:col-span-2">
              <Select
                label={t.eolLabel}
                hint={t.eolHint}
                value={endOfLifeA}
                onChange={(event) =>
                  setEndOfLifeA((event.target as HTMLSelectElement).value)
                }
              >
                <SelectOption value="reciclagem">{t.eolRecycle}</SelectOption>
                <SelectOption value="aterro">{t.eolLandfill}</SelectOption>
                <SelectOption value="incineracao">{t.eolIncineration}</SelectOption>
              </Select>
            </div>
          </StepCard>

          <StepCard title={t.materialB} bodyClassName="grid gap-4 sm:grid-cols-2">
            <Combobox
              label={t.materialLabel}
              hint={t.materialHint}
              options={materialOptions}
              value={selectedMatB}
              onChange={(value) => {
                setMaterialBId(value);
                setProcessBId("");
              }}
            />
            {detailB.isSuccess && processesB.length === 0 ? (
              <div className="flex flex-col gap-1">
                <span className="msds-field-label">{t.processLabel}</span>
                <Alert tone="warning">{t.noProcess}</Alert>
              </div>
            ) : (
              <Select
                label={t.processLabel}
                hint={t.processHint}
                value={selectedProcB}
                disabled={processesB.length === 0}
                onChange={(event) =>
                  setProcessBId((event.target as HTMLSelectElement).value)
                }
              >
                {processesB.map((process) => (
                  <SelectOption key={process.id} value={String(process.id)}>
                    {process.name}
                  </SelectOption>
                ))}
              </Select>
            )}
            <NumberInput
              label={t.massLabel}
              hint={t.massHint}
              value={massB}
              min={0}
              step="any"
              onChange={(event) => setMassB(event.target.value)}
            />
            <NumberInput
              label={t.recycledLabel}
              hint={t.recycledHint}
              value={recycledB}
              min={0}
              max={1}
              step="any"
              onChange={(event) => setRecycledB(event.target.value)}
            />
            <div className="sm:col-span-2">
              <Select
                label={t.eolLabel}
                hint={t.eolHint}
                value={endOfLifeB}
                onChange={(event) =>
                  setEndOfLifeB((event.target as HTMLSelectElement).value)
                }
              >
                <SelectOption value="reciclagem">{t.eolRecycle}</SelectOption>
                <SelectOption value="aterro">{t.eolLandfill}</SelectOption>
                <SelectOption value="incineracao">{t.eolIncineration}</SelectOption>
              </Select>
            </div>
          </StepCard>
        </div>
      )}

      <StepCard
        title={modeChoice === "individual" ? t.useStep : t.sharedPremises}
        description={t.useHint}
        footer={
          <div className="flex flex-wrap items-center gap-3">
            {modeChoice === "individual" ? (
              <Button
                variant="primary"
                onClick={() => audit.mutate()}
                disabled={!ready || audit.isPending}
                aria-describedby={blocked ? "eco-motivo" : undefined}
              >
                {audit.isPending ? t.running : t.run}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => comparisonMutation.mutate()}
                disabled={!ready || comparisonMutation.isPending}
                aria-describedby={blocked ? "eco-motivo" : undefined}
              >
                {comparisonMutation.isPending ? t.compareRunning : t.compareRun}
              </Button>
            )}
            {blocked ? (
              <p id="eco-motivo" className="text-support text-ink-muted">
                {blocked.reason}
              </p>
            ) : null}
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {modeChoice === "compare" && (
            <>
              <Select
                label={t.transportModeLabel}
                value={selectedMode}
                onChange={(event) =>
                  setMode((event.target as HTMLSelectElement).value)
                }
              >
                {(modes.data ?? []).map((item) => (
                  <SelectOption key={item.slug} value={item.slug}>
                    {item.name}
                  </SelectOption>
                ))}
              </Select>
              <NumberInput
                label={t.transportDistanceLabel}
                value={distance}
                min={0}
                step="any"
                onChange={(event) => setDistance(event.target.value)}
              />
            </>
          )}
          <Select
            label={t.useModelLabel}
            value={useModel}
            onChange={(event) =>
              setUseModel((event.target as HTMLSelectElement).value as UseModel)
            }
          >
            <SelectOption value="estatico">{t.useStatic}</SelectOption>
            <SelectOption value="movel">{t.useMobile}</SelectOption>
          </Select>
          {modeChoice === "individual" && (
            <Select
              label={t.eolLabel}
              hint={t.eolHint}
              value={endOfLife}
              onChange={(event) =>
                setEndOfLife((event.target as HTMLSelectElement).value)
              }
            >
              <SelectOption value="reciclagem">{t.eolRecycle}</SelectOption>
              <SelectOption value="aterro">{t.eolLandfill}</SelectOption>
              <SelectOption value="incineracao">{t.eolIncineration}</SelectOption>
            </Select>
          )}
        </div>
        <Disclosure
          summary={
            useModel === "estatico"
              ? t.useSummaryStatic(
                  printable(life),
                  printable(power),
                  printable(duty),
                  printable(carbonPerEnergy),
                )
              : t.useSummaryMobile(
                  printable(life),
                  printable(travel),
                  printable(intensity),
                  printable(carbonPerEnergy),
                )
          }
          open={premisesOpen || Boolean(blocked?.inPremises)}
          onOpenChange={setPremisesOpen}
        >
          <div className="grid gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
            <NumberInput
              label={t.lifeLabel}
              value={life}
              min={0}
              step="any"
              onChange={(event) => setLife(event.target.value)}
            />
            {useModel === "estatico" ? (
              <>
                <NumberInput
                  label={t.powerLabel}
                  value={power}
                  min={0}
                  step="any"
                  onChange={(event) => setPower(event.target.value)}
                />
                <NumberInput
                  label={t.dutyLabel}
                  hint={t.dutyHint}
                  value={duty}
                  min={0}
                  max={1}
                  step="any"
                  onChange={(event) => setDuty(event.target.value)}
                />
              </>
            ) : (
              <>
                <NumberInput
                  label={t.travelLabel}
                  value={travel}
                  min={0}
                  step="any"
                  onChange={(event) => setTravel(event.target.value)}
                />
                <NumberInput
                  label={t.intensityLabel}
                  value={intensity}
                  min={0}
                  step="any"
                  onChange={(event) => setIntensity(event.target.value)}
                />
              </>
            )}
            <NumberInput
              label={t.carbonPerEnergyLabel}
              hint={t.carbonPerEnergyHint}
              value={carbonPerEnergy}
              min={0}
              step="any"
              onChange={(event) => setCarbonPerEnergy(event.target.value)}
            />
          </div>
        </Disclosure>
        {audit.isError ? <Alert tone="danger">{String(audit.error)}</Alert> : null}
        {comparisonMutation.isError ? (
          <Alert tone="danger">{String(comparisonMutation.error)}</Alert>
        ) : null}
      </StepCard>

      {modeChoice === "individual" ? (
        <StepCard title={t.resultStep}>
          {result ? (
            <>
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium text-ink">
                  {t.dominanceTitle}
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Podium
                    label={t.dominanceEnergy}
                    dominance={result.energy_dominance}
                  />
                  <Podium
                    label={t.dominanceCarbon}
                    dominance={result.carbon_dominance}
                  />
                </div>
              </div>

              <PhaseTable result={result} />

              <div className="flex flex-col gap-4">
                <PhaseBars
                  title={ecoPhaseI18n.energyChartTitle}
                  unit={result.energy_unit}
                  rows={energyRows}
                />
                <PhaseBars
                  title={ecoPhaseI18n.carbonChartTitle}
                  unit={result.carbon_unit}
                  rows={carbonRows}
                />
              </div>

              <div className="well flex flex-col gap-2 text-xs text-ink-muted">
                <span>
                  <strong className="text-ink">{t.massBought}:</strong>{" "}
                  {formatNumber(result.mass_bought)} kg — {t.massBoughtHint}
                </span>
                <span>{result.recycling_credit_note}</span>
                <span>
                  <Link
                    className="text-accent underline underline-offset-2"
                    href={`/app/materiais/${result.material_id}`}
                  >
                    {result.material_name}
                  </Link>{" "}
                  · {result.process_name} · {result.transport_mode.name}
                </span>
              </div>
            </>
          ) : (
            <EmptyState title={t.resultIdleTitle} description={t.resultIdleHint} />
          )}
        </StepCard>
      ) : (
        <StepCard title={t.compareResultStep}>
          {compareResult ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="well flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{t.winnerEnergy}</span>
                    <Badge tone="success">
                      {compareResult.winner_energy === "material_a"
                        ? compareResult.material_a.material_name
                        : compareResult.winner_energy === "material_b"
                          ? compareResult.material_b.material_name
                          : t.tieEnergy}
                    </Badge>
                  </div>
                  {compareResult.delta_energy_percent !== null && Math.abs(compareResult.delta_energy_percent) > 0.01 && (
                    <span className="text-xs text-ink-muted">
                      {t.savingsEnergy(Math.abs(compareResult.delta_energy_percent))}
                    </span>
                  )}
                </div>

                <div className="well flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{t.winnerCarbon}</span>
                    <Badge tone="brand">
                      {compareResult.winner_carbon === "material_a"
                        ? compareResult.material_a.material_name
                        : compareResult.winner_carbon === "material_b"
                          ? compareResult.material_b.material_name
                          : t.tieCarbon}
                    </Badge>
                  </div>
                  {compareResult.delta_carbon_percent !== null && Math.abs(compareResult.delta_carbon_percent) > 0.01 && (
                    <span className="text-xs text-ink-muted">
                      {t.savingsCarbon(Math.abs(compareResult.delta_carbon_percent))}
                    </span>
                  )}
                </div>
              </div>

              <ComparisonTable result={compareResult} />

              <div className="flex flex-col gap-4">
                <PhaseBars
                  title={ecoPhaseI18n.energyChartCompareTitle}
                  unit={compareResult.material_a.energy_unit}
                  rows={compareEnergyRows}
                />
                <PhaseBars
                  title={ecoPhaseI18n.carbonChartCompareTitle}
                  unit={compareResult.material_a.carbon_unit}
                  rows={compareCarbonRows}
                />
              </div>
            </div>
          ) : (
            <EmptyState title={t.resultIdleTitle} description={t.resultIdleHint} />
          )}
        </StepCard>
      )}
    </div>
  );
}
