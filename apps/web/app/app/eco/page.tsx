"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  EcoAuditResult,
  EcoDominance,
  EcoPhase,
  UseModel,
} from "@/lib/types";
import {
  listMaterials,
  listTransportModes,
  runEcoAudit,
  getMaterial,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import {
  Alert,
  Button,
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

/**
 * Visible defaults, all overridable.
 *
 * Nothing here is a fact about a material or a process: a duty cycle, a service
 * life and a grid's carbon intensity are assumptions of the brief, the same
 * treatment D-64 gave the support condition and D-65 the write-off horizon. The
 * mass is deliberately **not** defaulted — it is the number that decides the
 * answer, and inventing it would be the tool writing the brief.
 */
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

/** An absent quantity is never a blank cell: it is a written reason (D-24). */
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
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
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

export default function EcoPage() {
  // The brief travels in the URL (B1), so the solver's result rows can link
  // here carrying the material and the mass they just computed.
  const params = useSearchParams();
  const materials = useQuery({
    queryKey: ["materials"],
    queryFn: () => listMaterials(),
  });
  const modes = useQuery({
    queryKey: ["transport-modes"],
    queryFn: listTransportModes,
  });

  const [materialId, setMaterialId] = useState(params.get("material") ?? "");
  const [mass, setMass] = useState(params.get("massa") ?? "");
  const [recycled, setRecycled] = useState(DEFAULTS.recycled);
  const [processId, setProcessId] = useState("");
  const [mode, setMode] = useState("");
  const [distance, setDistance] = useState(DEFAULTS.distance);
  const [useModel, setUseModel] = useState<UseModel>("movel");
  const [power, setPower] = useState(DEFAULTS.power);
  const [duty, setDuty] = useState(DEFAULTS.duty);
  const [life, setLife] = useState(DEFAULTS.life);
  const [travel, setTravel] = useState(DEFAULTS.travel);
  const [intensity, setIntensity] = useState(DEFAULTS.intensity);
  const [carbonPerEnergy, setCarbonPerEnergy] = useState(
    DEFAULTS.carbonPerEnergy,
  );
  const [endOfLife, setEndOfLife] = useState("reciclagem");
  const [result, setResult] = useState<EcoAuditResult | null>(null);

  // Derived, not stored by an effect: an empty selection simply *means*
  // "whatever the catalogue lists first". Writing it into state on mount would
  // be a setState inside useEffect, which this repo's lint rule flags — rightly,
  // since it renders twice and invents a change nobody made.
  const selectedMaterial = materialId || String(materials.data?.[0]?.id ?? "");
  const selectedMode = mode || modes.data?.[0]?.slug || "";

  // The candidate processes are the ones that make *this* material — the P0-2
  // join, not the whole process table.
  const detail = useQuery({
    queryKey: ["material", selectedMaterial],
    queryFn: () => getMaterial(Number(selectedMaterial)),
    enabled: selectedMaterial !== "",
  });
  const processes = useMemo(() => detail.data?.processes ?? [], [detail.data]);
  const selectedProcess = processId || String(processes[0]?.id ?? "");

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
        // Only the chosen model's fields are sent. The API refuses the other
        // model's fields rather than ignoring them, so sending both would be a
        // 400 — and sending them silently would be worse.
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

  const ready = useMemo(() => {
    const common = [mass, distance, life, carbonPerEnergy].map(Number);
    const perModel =
      useModel === "estatico"
        ? [power, duty].map(Number)
        : [travel, intensity].map(Number);
    return (
      selectedMaterial !== "" &&
      selectedProcess !== "" &&
      selectedMode !== "" &&
      Number(mass) > 0 &&
      Number(recycled) >= 0 &&
      Number(recycled) <= 1 &&
      [...common, ...perModel].every(
        (value) => Number.isFinite(value) && value > 0,
      ) &&
      (useModel !== "estatico" || Number(duty) <= 1)
    );
  }, [
    selectedMaterial,
    selectedProcess,
    selectedMode,
    mass,
    recycled,
    distance,
    life,
    carbonPerEnergy,
    useModel,
    power,
    duty,
    travel,
    intensity,
  ]);

  if (materials.isLoading || modes.isLoading)
    return <LoadingState label={t.title} />;
  if (materials.isError)
    return <ErrorState description={String(materials.error)} />;
  if (modes.isError) return <ErrorState description={String(modes.error)} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <StepCard title={t.briefStep} bodyClassName="grid gap-4 sm:grid-cols-2">
          <Select
            label={t.materialLabel}
            value={selectedMaterial}
            onChange={(event) => {
              setMaterialId((event.target as HTMLSelectElement).value);
              // The process list belongs to the material; keeping a stale id
              // would send a process that does not make it, and earn a 404.
              setProcessId("");
            }}
          >
            {(materials.data ?? []).map((material) => (
              <SelectOption key={material.id} value={String(material.id)}>
                {material.name}
              </SelectOption>
            ))}
          </Select>
          {detail.isSuccess && processes.length === 0 ? (
            // D-24: an empty <select> read as a control that failed to load.
            // A material with no process can't be audited, and the screen
            // says so where the process would have been chosen.
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

      <StepCard
        title={t.useStep}
        description={t.useHint}
        bodyClassName="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        footer={
          <Button
            variant="primary"
            onClick={() => audit.mutate()}
            disabled={!ready || audit.isPending}
          >
            {audit.isPending ? t.running : t.run}
          </Button>
        }
      >
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
        {audit.isError ? (
          <Alert tone="danger" className="sm:col-span-2 xl:col-span-3">
            {String(audit.error)}
          </Alert>
        ) : null}
      </StepCard>

      <StepCard title={t.resultStep}>
        {result ? (
          <>
            {/* The answer is not the total — it is which phase dominates, and
                the two quantities get their own podium because they can
                disagree. */}
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

            <div className="flex flex-col gap-2 rounded-card border border-edge bg-surface-sunken p-4 text-xs text-ink-muted">
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
    </div>
  );
}
