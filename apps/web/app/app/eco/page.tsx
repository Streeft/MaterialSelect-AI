"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLiveResult } from "@/lib/useLiveResult";
import { describeApiError } from "@/lib/errors";
import type {
  EcoAuditRequest,
  EcoAuditResult,
  EcoComparisonRequest,
  EcoComparisonResult,
  EcoDominance,
  EcoPhase,
  EndOfLifeRoute,
  EndOfLifeRouteInfo,
  TransportMode,
  UseModel,
} from "@/lib/types";
import {
  listEndOfLifeRoutes,
  listMaterials,
  listTransportModes,
  runEcoAudit,
  compareEcoAudits,
  getMaterial,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber, formatTyped } from "@/lib/format";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import { PhaseBars, type PhaseBarRow } from "@/components/eco/PhaseBars";
import { EcoExportMenu } from "@/components/eco/EcoExportMenu";
import {
  Alert,
  Badge,
  ButtonGroup,
  ButtonGroupItem,
  Combobox,
  Disclosure,
  InlineTable,
  Input,
  EmptyState,
  ErrorState,
  NumberInput,
  PageHeader,
  SheetSkeleton,
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
  type InlineColumn,
} from "@/components/ui";
import { ParamsPanel, ParamsResultLayout, ResultPanel } from "@/components/layout/ParamsResult";

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

/** One line of the bill of materials, as typed (strings: the inputs own them). */
interface ComponentDraft {
  key: number;
  name: string;
  materialId: string;
  processId: string;
  mass: string;
  quantity: string;
  recycled: string;
  endOfLife: EndOfLifeRoute;
}

interface LegDraft {
  key: number;
  mode: string;
  distance: string;
}

function emptyComponent(key: number): ComponentDraft {
  return {
    key,
    name: "",
    materialId: "",
    processId: "",
    mass: "",
    quantity: "1",
    recycled: DEFAULTS.recycled,
    endOfLife: "reciclagem",
  };
}

function Updating() {
  return <span className="text-caption text-ink-muted">{ptBR.ui.updating}</span>;
}

function routeOptionLabel(route: EndOfLifeRouteInfo): string {
  return route.materials_with_factor === 0 && route.energy_property !== null
    ? `${route.label} — ${t.eolNoFactor}`
    : route.label;
}

function RouteOptions({ routes }: { routes: EndOfLifeRouteInfo[] }) {
  return (
    <>
      {routes.map((route) => (
        <SelectOption key={route.slug} value={route.slug}>
          {routeOptionLabel(route)}
        </SelectOption>
      ))}
    </>
  );
}

const COMPONENT_COLUMNS: InlineColumn[] = [
  { id: "name", header: t.colName, minWidth: "7rem" },
  { id: "material", header: t.colMaterial, minWidth: "11rem" },
  { id: "process", header: t.colProcess, minWidth: "9rem" },
  { id: "mass", header: t.colUnitMass, hint: t.unitKg, numeric: true, minWidth: "6.5rem" },
  { id: "quantity", header: t.colQuantity, numeric: true, minWidth: "4.5rem" },
  { id: "recycled", header: t.colRecycled, hint: t.colRecycledHint, numeric: true, minWidth: "5.5rem" },
  { id: "eol", header: t.colEol, minWidth: "8rem" },
];

/**
 * D-216: the bill of materials as a table edited in place — one row per
 * component, "+ Adicionar componente" under the last, ⋯ per row with Duplicar
 * and Remover (Desfazer). Each control names itself by column and row, so a
 * screen reader hears "Massa de uma unidade, Componente 2 (kg)".
 */
function ComponentsTable({
  components,
  resolved,
  materialOptions,
  processesOf,
  processesLoaded,
  routes,
  onPatch,
  onAdd,
  onDuplicate,
  onRemove,
  onRestore,
}: {
  components: ComponentDraft[];
  resolved: ComponentDraft[];
  materialOptions: { value: string; label: string; description: string; keywords: string[] }[];
  processesOf: (index: number) => { id: number; name: string }[];
  processesLoaded: (index: number) => boolean;
  routes: EndOfLifeRouteInfo[];
  onPatch: (key: number, patch: Partial<ComponentDraft>) => void;
  onAdd: () => void;
  onDuplicate: (draft: ComponentDraft) => void;
  onRemove: (draft: ComponentDraft) => void;
  onRestore: (draft: ComponentDraft, index: number) => void;
}) {
  return (
    <InlineTable
      label={t.componentsTable}
      columns={COMPONENT_COLUMNS}
      stackBelow="md"
      rows={components}
      rowKey={(draft) => draft.key}
      rowName={(_draft, index) => t.componentLegend(index + 1)}
      onAdd={onAdd}
      addLabel={t.addComponent}
      onDuplicate={(draft) => onDuplicate(draft)}
      onRemove={(draft) => onRemove(draft)}
      onRestore={onRestore}
      renderCell={(draft, column, index) => {
        const row = t.componentLegend(index + 1);
        const cell = (header: string) => t.cellLabel(header, row);
        const shown = resolved[index] ?? draft;
        const processes = processesOf(index);
        switch (column.id) {
          case "name":
            return (
              <Input
                label={cell(t.colName)}
                placeholder={t.componentNameHint}
                value={draft.name}
                maxLength={120}
                onChange={(event) => onPatch(draft.key, { name: event.target.value })}
              />
            );
          case "material":
            return (
              <Combobox
                label={cell(t.colMaterial)}
                options={materialOptions}
                value={shown.materialId}
                onChange={(value) => onPatch(draft.key, { materialId: value, processId: "" })}
              />
            );
          case "process":
            return processesLoaded(index) && processes.length === 0 ? (
              <span className="text-support text-ink-muted">{t.noProcessShort}</span>
            ) : (
              <Select
                label={cell(t.colProcess)}
                value={shown.processId}
                disabled={processes.length === 0}
                onChange={(event) =>
                  onPatch(draft.key, { processId: (event.target as HTMLSelectElement).value })
                }
              >
                {processes.map((process) => (
                  <SelectOption key={process.id} value={String(process.id)}>
                    {process.name}
                  </SelectOption>
                ))}
              </Select>
            );
          case "mass":
            return (
              <NumberInput
                label={cell(t.colUnitMass)}
                unit={t.unitKg}
                value={draft.mass}
                min={0}
                step="any"
                onChange={(event) => onPatch(draft.key, { mass: event.target.value })}
              />
            );
          case "quantity":
            return (
              <NumberInput
                label={cell(t.colQuantity)}
                value={draft.quantity}
                min={1}
                step={1}
                onChange={(event) => onPatch(draft.key, { quantity: event.target.value })}
              />
            );
          case "recycled":
            return (
              <NumberInput
                label={cell(t.colRecycled)}
                value={draft.recycled}
                min={0}
                max={1}
                step="any"
                onChange={(event) => onPatch(draft.key, { recycled: event.target.value })}
              />
            );
          default:
            return (
              <Select
                label={cell(t.colEol)}
                value={draft.endOfLife}
                onChange={(event) =>
                  onPatch(draft.key, {
                    endOfLife: (event.target as HTMLSelectElement).value as EndOfLifeRoute,
                  })
                }
              >
                <RouteOptions routes={routes} />
              </Select>
            );
        }
      }}
    />
  );
}

const LEG_COLUMNS: InlineColumn[] = [
  { id: "mode", header: t.colMode, minWidth: "10rem" },
  { id: "distance", header: t.colDistance, hint: t.unitKm, numeric: true, minWidth: "8rem" },
];

function LegsTable({
  legs,
  resolved,
  modes,
  onPatch,
  onAdd,
  onDuplicate,
  onRemove,
  onRestore,
}: {
  legs: LegDraft[];
  resolved: LegDraft[];
  modes: TransportMode[];
  onPatch: (key: number, patch: Partial<LegDraft>) => void;
  onAdd: () => void;
  onDuplicate: (draft: LegDraft) => void;
  onRemove: (draft: LegDraft) => void;
  onRestore: (draft: LegDraft, index: number) => void;
}) {
  return (
    <InlineTable
      label={t.legsTable}
      columns={LEG_COLUMNS}
      rows={legs}
      rowKey={(draft) => draft.key}
      rowName={(_draft, index) => t.legLegend(index + 1)}
      onAdd={onAdd}
      addLabel={t.addLeg}
      onDuplicate={(draft) => onDuplicate(draft)}
      onRemove={(draft) => onRemove(draft)}
      onRestore={onRestore}
      renderCell={(draft, column, index) => {
        const row = t.legLegend(index + 1);
        return column.id === "mode" ? (
          <Select
            label={t.cellLabel(t.colMode, row)}
            value={resolved[index]?.mode ?? draft.mode}
            onChange={(event) => onPatch(draft.key, { mode: (event.target as HTMLSelectElement).value })}
          >
            {modes.map((item) => (
              <SelectOption key={item.slug} value={item.slug}>
                {item.name}
              </SelectOption>
            ))}
          </Select>
        ) : (
          <NumberInput
            label={t.cellLabel(t.colDistance, row)}
            unit={t.unitKm}
            value={draft.distance}
            min={0}
            step="any"
            onChange={(event) => onPatch(draft.key, { distance: event.target.value })}
          />
        );
      }}
    />
  );
}

function ComponentTable({ result }: { result: EcoAuditResult }) {
  const phaseLabels = result.components[0]?.phases.map((phase) => phase.label) ?? [];
  return (
    <TableScroll label={t.componentsTitle}>
      <Table>
        <TableCaption>{t.componentsTitle}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnComponent}</Th>
            <Th scope="col">{t.columnMassBought}</Th>
            {phaseLabels.map((label) => (
              <Th key={label} scope="col">{`${label} (${result.energy_unit} · ${result.carbon_unit})`}</Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {result.components.map((component, index) => (
            <Tr key={`${component.name}-${index}`}>
              <Td>
                <div className="font-medium">{component.name}</div>
                <div className="text-caption text-ink-muted">
                  <Link
                    className="text-accent underline underline-offset-2"
                    href={`/app/materiais/${component.material_id}`}
                  >
                    {component.material_name}
                  </Link>{" "}
                  · {component.process_name} · {component.quantity} ×{" "}
                  {formatNumber(component.unit_mass)} kg · {component.end_of_life_label}
                </div>
              </Td>
              <Td className="tabular-nums">{formatNumber(component.mass_bought)}</Td>
              {component.phases.map((phase) => (
                <Td key={phase.phase} className="text-caption">
                  <div>
                    <Quantity value={phase.energy} reason={phase.energy_reason} />
                  </div>
                  <div className="text-ink-muted">
                    <Quantity value={phase.carbon} reason={phase.carbon_reason} />
                  </div>
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

function LegTable({ result }: { result: EcoAuditResult }) {
  return (
    <TableScroll label={t.legsTitle}>
      <Table>
        <TableCaption>{t.legsTitle}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnLeg}</Th>
            <Th scope="col">{`${t.transportDistanceLabel} (${t.unitKm})`}</Th>
            <Th scope="col">{`${t.columnEnergy} (${result.energy_unit})`}</Th>
            <Th scope="col">{`${t.columnCarbon} (${result.carbon_unit})`}</Th>
          </Tr>
        </THead>
        <TBody>
          {result.transport_legs.map((leg, index) => (
            <Tr key={`${leg.mode.slug}-${index}`}>
              <Td className="font-medium">{`${t.legLegend(index + 1)} · ${leg.mode.name}`}</Td>
              <Td className="tabular-nums">{formatNumber(leg.distance_km)}</Td>
              <Td>
                <Quantity value={leg.energy} reason={leg.energy_reason} />
              </Td>
              <Td>
                <Quantity value={leg.carbon} reason={leg.carbon_reason} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
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
    <span className="text-caption text-ink-muted">{reason ?? "Não calculada"}</span>
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
        <span className="text-body text-ink">
          <strong>{dominance.label}</strong>
          {dominance.share !== null ? (
            <>
              {" "}
              — {formatNumber(dominance.share * 100)}% {t.dominanceShare}
            </>
          ) : null}
        </span>
      ) : (
        <span className="text-body text-ink-muted">{dominance.refusal}</span>
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
              <Td className="text-caption text-ink-muted">{phase.detail}</Td>
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

function Cell({ value, unit, reason }: { value: number | null; unit: string; reason: string | null | undefined }) {
  return value !== null ? (
    <>{`${formatNumber(value)} ${unit}`}</>
  ) : (
    <span className="text-ink-muted">{reason ?? t.noTotal}</span>
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
      energyReasonA: pA.energy_reason,
      energyReasonB: pB?.energy_reason ?? null,
      carbonReasonA: pA.carbon_reason,
      carbonReasonB: pB?.carbon_reason ?? null,
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
                <Td className="tabular-nums text-caption">
                  <div>
                    <Cell value={p.energyA} unit={energyUnit} reason={p.energyReasonA} />
                  </div>
                  <div className="text-ink-muted">
                    <Cell value={p.carbonA} unit={carbonUnit} reason={p.carbonReasonA} />
                  </div>
                </Td>
                <Td className="tabular-nums text-caption">
                  <div>
                    <Cell value={p.energyB} unit={energyUnit} reason={p.energyReasonB} />
                  </div>
                  <div className="text-ink-muted">
                    <Cell value={p.carbonB} unit={carbonUnit} reason={p.carbonReasonB} />
                  </div>
                </Td>
                <Td className="tabular-nums text-caption">
                  <div className={deltaE !== null ? (deltaE < 0 ? "text-success-fg font-medium" : deltaE > 0 ? "text-danger-fg" : "text-ink-muted") : "text-ink-muted"}>
                    {deltaE !== null ? `${deltaE > 0 ? "+" : ""}${formatNumber(deltaE)} ${energyUnit}` : t.noDelta}
                  </div>
                  <div className={deltaC !== null ? (deltaC < 0 ? "text-success-fg font-medium" : deltaC > 0 ? "text-danger-fg" : "text-ink-muted") : "text-ink-muted"}>
                    {deltaC !== null ? `${deltaC > 0 ? "+" : ""}${formatNumber(deltaC)} ${carbonUnit}` : t.noDelta}
                  </div>
                </Td>
              </Tr>
            );
          })}
          <Tr>
            <Td className="font-medium">{t.totalLabel}</Td>
            <Td className="tabular-nums font-semibold text-caption">
              <div>
                <Cell value={resA.total_energy} unit={energyUnit} reason={t.noTotal} />
              </div>
              <div className="text-ink-muted">
                <Cell value={resA.total_carbon} unit={carbonUnit} reason={t.noTotal} />
              </div>
            </Td>
            <Td className="tabular-nums font-semibold text-caption">
              <div>
                <Cell value={resB.total_energy} unit={energyUnit} reason={t.noTotal} />
              </div>
              <div className="text-ink-muted">
                <Cell value={resB.total_carbon} unit={carbonUnit} reason={t.noTotal} />
              </div>
            </Td>
            <Td className="tabular-nums font-semibold text-caption">
              <div className={result.delta_energy !== null ? (result.delta_energy < 0 ? "text-success-fg" : result.delta_energy > 0 ? "text-danger-fg" : "text-ink-muted") : "text-ink-muted"}>
                {result.delta_energy !== null
                  ? `${result.delta_energy > 0 ? "+" : ""}${formatNumber(result.delta_energy)} ${energyUnit} (${result.delta_energy_percent !== null ? (result.delta_energy_percent > 0 ? "+" : "") + formatNumber(result.delta_energy_percent) + "%" : ""})`
                  : t.noDelta}
              </div>
              <div className={result.delta_carbon !== null ? (result.delta_carbon < 0 ? "text-success-fg" : result.delta_carbon > 0 ? "text-danger-fg" : "text-ink-muted") : "text-ink-muted"}>
                {result.delta_carbon !== null
                  ? `${result.delta_carbon > 0 ? "+" : ""}${formatNumber(result.delta_carbon)} ${carbonUnit} (${result.delta_carbon_percent !== null ? (result.delta_carbon_percent > 0 ? "+" : "") + formatNumber(result.delta_carbon_percent) + "%" : ""})`
                  : t.noDelta}
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
  const routes = useQuery({
    queryKey: ["eco-end-of-life-routes"],
    queryFn: listEndOfLifeRoutes,
  });

  const [modeChoice, setModeChoice] = useState<"individual" | "compare">("individual");

  // Individual mode state: the product (D-121). The solver's deep link
  // (?material=&massa=) seeds the first component; the list itself is not put
  // in the URL — the flow never kept more than that seed there.
  const nextKey = useRef(1);
  const newKey = () => nextKey.current++;
  const [components, setComponents] = useState<ComponentDraft[]>(() => [
    {
      key: 0,
      name: "",
      materialId: params.get("material") ?? "",
      processId: "",
      mass: params.get("massa") ?? "",
      quantity: "1",
      recycled: DEFAULTS.recycled,
      endOfLife: "reciclagem",
    },
  ]);
  const [legs, setLegs] = useState<LegDraft[]>(() => [
    { key: 0, mode: "", distance: DEFAULTS.distance },
  ]);

  // Compare mode state
  const [materialAId, setMaterialAId] = useState("");
  const [massA, setMassA] = useState(params.get("massa") ?? "1");
  const [recycledA, setRecycledA] = useState(DEFAULTS.recycled);
  const [processAId, setProcessAId] = useState("");
  const [endOfLifeA, setEndOfLifeA] = useState<EndOfLifeRoute>("reciclagem");

  const [materialBId, setMaterialBId] = useState("");
  const [massB, setMassB] = useState("1");
  const [recycledB, setRecycledB] = useState(DEFAULTS.recycled);
  const [processBId, setProcessBId] = useState("");
  const [endOfLifeB, setEndOfLifeB] = useState<EndOfLifeRoute>("reciclagem");

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

  const firstMaterial = String(materials.data?.[0]?.id ?? "");
  const firstMode = modes.data?.[0]?.slug ?? "";
  const selectedMode = mode || firstMode;

  // What each component and leg resolves to once defaults are applied, so the
  // brief sent is exactly what the screen shows.
  const componentMaterials = components.map((c) => c.materialId || firstMaterial);
  const details = useQueries({
    queries: componentMaterials.map((id) => ({
      queryKey: ["material", id],
      queryFn: () => getMaterial(Number(id)),
      enabled: modeChoice === "individual" && id !== "",
    })),
  });
  const componentProcesses = details.map((query) => query.data?.processes ?? []);
  const resolvedComponents = components.map((c, index) => ({
    ...c,
    materialId: componentMaterials[index] ?? "",
    processId: c.processId || String(componentProcesses[index]?.[0]?.id ?? ""),
  }));
  const resolvedLegs = legs.map((leg) => ({ ...leg, mode: leg.mode || firstMode }));

  const patchComponent = (key: number, patch: Partial<ComponentDraft>) =>
    setComponents((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const patchLeg = (key: number, patch: Partial<LegDraft>) =>
    setLegs((list) => list.map((leg) => (leg.key === key ? { ...leg, ...patch } : leg)));

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

  const briefFromScreen = (): EcoAuditRequest => ({
    components: resolvedComponents.map((c) => ({
      name: c.name.trim() === "" ? null : c.name.trim(),
      material_id: Number(c.materialId),
      process_id: Number(c.processId),
      unit_mass: Number(c.mass),
      quantity: Number(c.quantity),
      recycled_fraction: Number(c.recycled),
      end_of_life: c.endOfLife,
    })),
    transport_legs: resolvedLegs.map((leg) => ({
      mode: leg.mode,
      distance_km: Number(leg.distance),
    })),
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
  });

  const compareFromScreen = (): EcoComparisonRequest => ({
        material_a: {
          material_id: Number(selectedMatA),
          process_id: Number(selectedProcA),
          part_mass: Number(massA),
          recycled_fraction: Number(recycledA),
          end_of_life: endOfLifeA,
        },
        material_b: {
          material_id: Number(selectedMatB),
          process_id: Number(selectedProcB),
          part_mass: Number(massB),
          recycled_fraction: Number(recycledB),
          end_of_life: endOfLifeB,
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
      });


  // Plain function, not a memo: the resolved lists are rebuilt every render
  // and the check is a few comparisons.
  const blockedReason = (): { reason: string; inPremises: boolean } | null => {
    const positive = (raw: string) => {
      const value = Number(raw);
      return raw.trim() !== "" && Number.isFinite(value) && value > 0;
    };
    const nonNegative = (raw: string) => {
      const value = Number(raw);
      return raw.trim() !== "" && Number.isFinite(value) && value >= 0;
    };
    if (modeChoice === "individual") {
      for (const [index, leg] of resolvedLegs.entries()) {
        if (leg.mode === "")
          return { reason: t.blocked.leg(index + 1, t.blocked.mode), inPremises: false };
        if (!nonNegative(leg.distance))
          return {
            reason: t.blocked.leg(index + 1, t.blocked.positive(t.transportDistanceLabel)),
            inPremises: false,
          };
      }
    } else {
      if (selectedMode === "") return { reason: t.blocked.mode, inPremises: false };
      if (!positive(distance))
        return { reason: t.blocked.positive(t.transportDistanceLabel), inPremises: false };
    }
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
      const single = resolvedComponents.length === 1;
      for (const [index, c] of resolvedComponents.entries()) {
        const say = (reason: string) => ({
          reason: single ? reason : t.blocked.component(index + 1, reason),
          inPremises: false,
        });
        if (c.materialId === "" || c.processId === "") return say(t.blocked.process);
        if (!positive(c.mass)) return say(t.blocked.mass);
        const quantity = Number(c.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) return say(t.blocked.quantity);
        const recycledValue = Number(c.recycled);
        if (c.recycled.trim() === "" || !(recycledValue >= 0 && recycledValue <= 1))
          return say(t.blocked.recycled);
      }
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
  };
  const blocked = blockedReason();

  const ready = blocked === null;

  // D-216: both modes answer as the reader types; the numbers are the server's.
  // The export sends the brief the shown result answers (D-172), never the inputs.
  const liveAudit = useLiveResult<EcoAuditRequest, EcoAuditResult>({
    key: "eco-ao-vivo",
    request: modeChoice === "individual" && ready ? briefFromScreen() : null,
    fetcher: runEcoAudit,
  });
  const liveCompare = useLiveResult<EcoComparisonRequest, EcoComparisonResult>({
    key: "eco-comparar-ao-vivo",
    request: modeChoice === "compare" && ready ? compareFromScreen() : null,
    fetcher: compareEcoAudits,
  });
  const result = liveAudit.data ?? null;
  const resultBrief = liveAudit.dataRequest;
  const compareResult = liveCompare.data ?? null;
  const live = modeChoice === "individual" ? liveAudit : liveCompare;

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
            seriesName: resA.material_name ?? t.materialA,
            value: pA.energy,
            reason: pA.energy_reason,
            tone: "primary",
          },
          {
            seriesName: resB.material_name ?? t.materialB,
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
            seriesName: resA.material_name ?? t.materialA,
            value: pA.carbon,
            reason: pA.carbon_reason,
            tone: "primary",
          },
          {
            seriesName: resB.material_name ?? t.materialB,
            value: pB?.carbon ?? null,
            reason: pB?.carbon_reason,
            tone: "secondary",
          },
        ],
      };
    });
  }, [compareResult]);

  if (materials.isLoading || modes.isLoading || routes.isLoading)
    return <SheetSkeleton label={t.title} />;
  if (materials.isError)
    return <ErrorState error={materials.error} onRetry={() => void materials.refetch()} />;
  if (modes.isError) return <ErrorState error={modes.error} onRetry={() => void modes.refetch()} />;
  if (routes.isError) return <ErrorState error={routes.error} onRetry={() => void routes.refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <div className="flex items-center">
        <ButtonGroup label={t.title}>
          <ButtonGroupItem
            selected={modeChoice === "individual"}
            onClick={() => setModeChoice("individual")}
            label={t.modeIndividual}
          />
          <ButtonGroupItem
            selected={modeChoice === "compare"}
            onClick={() => setModeChoice("compare")}
            label={t.modeCompare}
          />
        </ButtonGroup>
      </div>

      <ParamsResultLayout>
        <ParamsPanel>
          {modeChoice === "individual" ? (
            <div className="flex flex-col gap-6">
              <StepCard title={t.productStep} description={t.productHint}>
                <ComponentsTable
                  components={components}
                  resolved={resolvedComponents}
                  materialOptions={materialOptions}
                  processesOf={(index) => componentProcesses[index] ?? []}
                  processesLoaded={(index) => Boolean(details[index]?.isSuccess)}
                  routes={routes.data ?? []}
                  onPatch={patchComponent}
                  onAdd={() => setComponents((list) => [...list, emptyComponent(newKey())])}
                  onDuplicate={(draft) =>
                    setComponents((list) => [...list, { ...draft, key: newKey() }])
                  }
                  onRemove={(draft) =>
                    setComponents((list) => list.filter((c) => c.key !== draft.key))
                  }
                  onRestore={(draft, index) =>
                    setComponents((list) => [...list.slice(0, index), draft, ...list.slice(index)])
                  }
                />
                <Disclosure summary={t.howToFill}>
                  <dl className="flex flex-col gap-2 pt-2 text-support">
                    {[
                      [t.colName, t.componentNameHint],
                      [t.colMaterial, t.materialHint],
                      [t.colProcess, t.processHint],
                      [t.colUnitMass, t.massHint],
                      [t.colRecycled, t.recycledHint],
                      [t.colEol, t.eolHint],
                    ].map(([term, help]) => (
                      <div key={term}>
                        <dt className="font-medium text-ink">{term}</dt>
                        <dd className="text-ink-muted">{help}</dd>
                      </div>
                    ))}
                  </dl>
                </Disclosure>
              </StepCard>

              <StepCard title={t.transportStep} description={t.legsHint}>
                <LegsTable
                  legs={legs}
                  resolved={resolvedLegs}
                  modes={modes.data ?? []}
                  onPatch={patchLeg}
                  onAdd={() => setLegs((list) => [...list, { key: newKey(), mode: "", distance: "0" }])}
                  onDuplicate={(draft) => setLegs((list) => [...list, { ...draft, key: newKey() }])}
                  onRemove={(draft) => setLegs((list) => list.filter((leg) => leg.key !== draft.key))}
                  onRestore={(draft, index) =>
                    setLegs((list) => [...list.slice(0, index), draft, ...list.slice(index)])
                  }
                />
              </StepCard>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
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
                  unit={t.unitKg}
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
                      setEndOfLifeA((event.target as HTMLSelectElement).value as EndOfLifeRoute)
                    }
                  >
                    <RouteOptions routes={routes.data ?? []} />
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
                  unit={t.unitKg}
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
                      setEndOfLifeB((event.target as HTMLSelectElement).value as EndOfLifeRoute)
                    }
                  >
                    <RouteOptions routes={routes.data ?? []} />
                  </Select>
                </div>
              </StepCard>
            </div>
          )}

          <StepCard
            title={modeChoice === "individual" ? t.useStep : t.sharedPremises}
            description={t.useHint}
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
                  unit={t.unitKm}
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
            </div>
            <Disclosure
              summary={
                useModel === "estatico"
                  ? t.useSummaryStatic(
                      formatTyped(life),
                      formatTyped(power),
                      formatTyped(duty),
                      formatTyped(carbonPerEnergy),
                    )
                  : t.useSummaryMobile(
                      formatTyped(life),
                      formatTyped(travel),
                      formatTyped(intensity),
                      formatTyped(carbonPerEnergy),
                    )
              }
              open={premisesOpen || Boolean(blocked?.inPremises)}
              onOpenChange={setPremisesOpen}
            >
              <div className="grid gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
                <NumberInput
                  label={t.lifeLabel}
                  unit={t.unitYears}
                  value={life}
                  min={0}
                  step="any"
                  onChange={(event) => setLife(event.target.value)}
                />
                {useModel === "estatico" ? (
                  <>
                    <NumberInput
                      label={t.powerLabel}
                  unit={t.unitW}
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
                  unit={t.unitKm}
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
          </StepCard>
        </ParamsPanel>

        <ResultPanel busy={live.updating}>
          {live.error ? (
            <Alert tone="danger">{describeApiError(live.error, t.title)}</Alert>
          ) : null}
          {modeChoice === "individual" ? (
            <StepCard title={t.resultStep} actions={live.updating ? <Updating /> : undefined}>
              {result ? (
                <>
                  <EcoExportMenu brief={resultBrief} />
                  <div className="flex flex-col gap-3">
                    <span className="text-body font-medium text-ink">
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
                  <ComponentTable result={result} />
                  <LegTable result={result} />

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

                  <div className="well flex flex-col gap-2 text-caption text-ink-muted">
                    <span>
                      <strong className="text-ink">{t.massBought}:</strong>{" "}
                      {formatNumber(result.mass_bought)} kg — {t.massBoughtHint}
                    </span>
                    <span>{result.recycling_credit_note}</span>
                    <span>{t.productSummary(result.components.length, result.transport_legs.length)}</span>
                  </div>
                </>
              ) : (
                <EmptyState title={t.resultIdleTitle} description={blocked?.reason ?? t.resultIdleHint} />
              )}
            </StepCard>
          ) : (
            <StepCard title={t.compareResultStep} actions={live.updating ? <Updating /> : undefined}>
              {compareResult ? (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="well flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-body font-medium text-ink">{t.winnerEnergy}</span>
                        <Badge tone="success">
                          {compareResult.winner_energy === "material_a"
                            ? compareResult.material_a.material_name
                            : compareResult.winner_energy === "material_b"
                              ? compareResult.material_b.material_name
                              : t.tieEnergy}
                        </Badge>
                      </div>
                      {compareResult.delta_energy_percent !== null && Math.abs(compareResult.delta_energy_percent) > 0.01 && (
                        <span className="text-caption text-ink-muted">
                          {t.savingsEnergy(Math.abs(compareResult.delta_energy_percent))}
                        </span>
                      )}
                    </div>

                    <div className="well flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-body font-medium text-ink">{t.winnerCarbon}</span>
                        <Badge tone="brand">
                          {compareResult.winner_carbon === "material_a"
                            ? compareResult.material_a.material_name
                            : compareResult.winner_carbon === "material_b"
                              ? compareResult.material_b.material_name
                              : t.tieCarbon}
                        </Badge>
                      </div>
                      {compareResult.delta_carbon_percent !== null && Math.abs(compareResult.delta_carbon_percent) > 0.01 && (
                        <span className="text-caption text-ink-muted">
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
                <EmptyState title={t.resultIdleTitle} description={blocked?.reason ?? t.resultIdleHint} />
              )}
            </StepCard>
          )}
        </ResultPanel>
      </ParamsResultLayout>
    </div>
  );
}
