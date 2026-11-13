"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLiveResult } from "@/lib/useLiveResult";
import { describeApiError } from "@/lib/errors";
import type {
  DefaultsResult,
  EcoAuditRequest,
  EcoAuditResult,
  EcoComparisonRequest,
  EcoComparisonResult,
  SuggestAction,
} from "@/lib/types";
import {
  compareEcoAudits,
  getMaterial,
  listEndOfLifeRoutes,
  listMaterials,
  listTransportModes,
  runEcoAudit,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import { useUrlState } from "@/lib/urlState";
import { PhaseBars, type PhaseBarRow } from "@/components/eco/PhaseBars";
import { PhaseWaterfall } from "@/components/eco/PhaseWaterfall";
import { EcoExportMenu } from "@/components/eco/EcoExportMenu";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  CopyLinkItem,
  Disclosure,
  EmptyState,
  ErrorState,
  NumberInput,
  PageHeader,
  SheetSkeleton,
  StepCard,
} from "@/components/ui";
import { AISuggestPanel } from "@/components/ai/AISuggestPanel";
import { revealField } from "@/lib/ai/revealField";
import { suggestText } from "@/lib/i18n-suggest";
import { DefaultsGate } from "@/components/layout/DefaultsGate";
import { ParamsPanel, ParamsResultLayout, ResultPanel } from "@/components/layout/ParamsResult";
import {
  ComponentsTable,
  HowToFill,
  LegsTable,
  ScenarioFields,
  TransportModeSelect,
  type MaterialOption,
} from "./EcoFields";
import { PremisesPanel } from "./PremisesPanel";
import {
  ComparisonTable,
  ComponentTable,
  LegTable,
  PhaseTable,
  Podium,
  PremisesSummary,
} from "./EcoResults";
import {
  aiParamPatch,
  blankComponent,
  blankLeg,
  buildAuditBrief,
  buildComparisonBrief,
  compareBlocked,
  ecoUrlSpec,
  effectiveComponents,
  effectiveLegs,
  individualBlocked,
  type ComponentDraft,
  type EcoView,
  type LegDraft,
  type Premises,
  type ScenarioDraft,
} from "./ecoBrief";

const t = ptBR.eco;

export default function EcoPage() {
  return (
    <DefaultsGate label={t.title}>{(defaults) => <EcoScreen defaults={defaults.eco} />}</DefaultsGate>
  );
}

/** Rows for the comparative bars: scenario A and B side by side, one quantity. */
function compareRows(
  result: EcoComparisonResult | null,
  quantity: "energy" | "carbon",
): PhaseBarRow[] {
  if (!result) return [];
  const resA = result.material_a;
  const resB = result.material_b;
  const reasonKey = `${quantity}_reason` as const;
  return resA.phases.map((pA) => {
    const pB = resB.phases.find((p) => p.phase === pA.phase);
    return {
      phase: pA.phase,
      label: pA.label,
      items: [
        {
          seriesName: resA.material_name ?? t.materialA,
          value: pA[quantity],
          reason: pA[reasonKey],
          tone: "primary",
        },
        {
          seriesName: resB.material_name ?? t.materialB,
          value: pB?.[quantity] ?? null,
          reason: pB?.[reasonKey],
          tone: "secondary",
        },
      ],
    };
  });
}

function WaterfallPair({ result, exportPrefix }: { result: EcoAuditResult; exportPrefix: string }) {
  return (
    <div className="flex flex-col gap-4">
      <PhaseWaterfall
        waterfall={result.energy_waterfall}
        title={ecoPhaseI18n.waterfall.energyTitle}
        exportName={`${exportPrefix}-energia`}
      />
      <PhaseWaterfall
        waterfall={result.carbon_waterfall}
        title={ecoPhaseI18n.waterfall.carbonTitle}
        exportName={`${exportPrefix}-carbono`}
      />
    </div>
  );
}

function EcoScreen({ defaults }: { defaults: DefaultsResult["eco"] }) {
  const materials = useQuery({ queryKey: ["materials"], queryFn: () => listMaterials() });
  const modes = useQuery({ queryKey: ["transport-modes"], queryFn: listTransportModes });
  const routes = useQuery({ queryKey: ["eco-end-of-life-routes"], queryFn: listEndOfLifeRoutes });

  // The whole question lives in the URL (D-216): product, scenarios A and B and
  // premises. A link reopens the same audit; a reload keeps what was typed.
  const spec = useMemo(() => ecoUrlSpec(defaults), [defaults]);
  const [brief, setBrief] = useUrlState(spec);
  const view = brief.view;


  const premises: Premises = {
    useModel: brief.useModel,
    life: brief.life,
    power: brief.power,
    duty: brief.duty,
    travel: brief.travel,
    intensity: brief.intensity,
    carbonPerEnergy: brief.carbonPerEnergy,
  };

  const firstMaterial = String(materials.data?.[0]?.id ?? "");
  const secondMaterial = String(materials.data?.[1]?.id ?? materials.data?.[0]?.id ?? "");
  const firstMode = modes.data?.[0]?.slug ?? "";
  const selectedMode = brief.mode || firstMode;

  const components = effectiveComponents(brief, defaults);
  const legs = effectiveLegs(brief, defaults);

  // What each component, leg and scenario resolves to once defaults are
  // applied, so the brief sent is exactly what the screen shows.
  const sides = [brief.a, brief.b] as const;
  const sideMaterials = [brief.a.material || firstMaterial, brief.b.material || secondMaterial];
  const individual = view === "individual";
  // One query per distinct material: two components (or A and B) of the same
  // material share it, and React Query rejects duplicate keys in one list.
  const wanted = individual
    ? components.map((c) => c.material || firstMaterial)
    : sideMaterials;
  const distinct = [...new Set(wanted.filter((id) => id !== ""))];
  const detailQueries = useQueries({
    queries: distinct.map((id) => ({
      queryKey: ["material", id],
      queryFn: () => getMaterial(Number(id)),
    })),
  });
  const detailOf = (id: string) => detailQueries[distinct.indexOf(id)];
  const componentDetails = components.map((c) => detailOf(c.material || firstMaterial));
  const sideDetails = sideMaterials.map((id) => detailOf(id));

  const resolvedComponents: ComponentDraft[] = components.map((c, index) => ({
    ...c,
    material: c.material || firstMaterial,
    process: c.process || String(componentDetails[index]?.data?.processes[0]?.id ?? ""),
  }));
  const resolvedLegs: LegDraft[] = legs.map((leg) => ({ ...leg, mode: leg.mode || firstMode }));
  const resolvedSides: ScenarioDraft[] = sides.map((side, index) => ({
    ...side,
    material: sideMaterials[index] ?? "",
    process: side.process || String(sideDetails[index]?.data?.processes[0]?.id ?? ""),
  }));

  // Edits write the effective list, not only the patch: the seed (`?material=`)
  // becomes a real first line the moment the reader changes anything.
  const patchComponent = (index: number, patch: Partial<ComponentDraft>) =>
    setBrief((current) => ({
      components: effectiveComponents(current, defaults).map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    }));
  const patchLeg = (index: number, patch: Partial<LegDraft>) =>
    setBrief((current) => ({
      legs: effectiveLegs(current, defaults).map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
    }));
  const patchSide = (key: "a" | "b", patch: Partial<ScenarioDraft>) =>
    setBrief((current) => ({ [key]: { ...current[key], ...patch } }));
  const patchPremises = (patch: Partial<Premises>) => setBrief(patch);

  const blocked = individual
    ? individualBlocked(resolvedComponents, resolvedLegs, premises)
    : compareBlocked(
        resolvedSides[0]!,
        resolvedSides[1]!,
        { mode: selectedMode, distance: brief.distance },
        premises,
      );
  const ready = blocked === null;

  // D-220: both modes answer as the reader types; the numbers are the server's.
  // The export sends the brief the shown result answers (D-172), never the inputs.
  const comparisonBrief = () =>
    buildComparisonBrief(
      resolvedSides[0]!,
      resolvedSides[1]!,
      { mode: selectedMode, distance: brief.distance },
      premises,
    );
  const liveAudit = useLiveResult<EcoAuditRequest, EcoAuditResult>({
    key: "eco-ao-vivo",
    request: individual && ready ? buildAuditBrief(resolvedComponents, resolvedLegs, premises) : null,
    fetcher: runEcoAudit,
  });
  const liveCompare = useLiveResult<EcoComparisonRequest, EcoComparisonResult>({
    key: "eco-comparar-ao-vivo",
    request: !individual && ready ? comparisonBrief() : null,
    fetcher: compareEcoAudits,
  });
  const result = liveAudit.data ?? null;
  const resultBrief = liveAudit.dataRequest;
  const compareResult = liveCompare.data ?? null;
  const live = individual ? liveAudit : liveCompare;

  // D-230: a suggested parameter is written where the reader would have typed it
  // (the URL) and the audit follows by itself; the field that changed is shown.
  const aiAudit = individual && ready ? buildAuditBrief(resolvedComponents, resolvedLegs, premises) : null;
  const acceptsAiAction = (action: SuggestAction) =>
    action.type !== "set_param" || aiParamPatch(brief, defaults, action.name, action.value) !== null;
  function applyAiAction(action: SuggestAction) {
    if (action.type !== "set_param") return;
    setBrief((current) => aiParamPatch(current, defaults, action.name, action.value) ?? {});
    revealField(action.name);
  }

  // D-220: rows of the product and of the legs, edited in place.
  const setComponents = (next: (list: ComponentDraft[]) => ComponentDraft[]) =>
    setBrief((current) => ({ components: next(effectiveComponents(current, defaults)) }));
  const setLegs = (next: (list: LegDraft[]) => LegDraft[]) =>
    setBrief((current) => ({ legs: next(effectiveLegs(current, defaults)) }));

  const materialOptions: MaterialOption[] = useMemo(
    () =>
      (materials.data ?? []).map((material) => ({
        value: String(material.id),
        label: material.name,
        description: material.class_name,
        keywords: [material.class_name],
      })),
    [materials.data],
  );

  if (materials.isLoading || modes.isLoading || routes.isLoading)
    return <SheetSkeleton label={t.title} />;
  if (materials.isError)
    return <ErrorState error={materials.error} onRetry={() => void materials.refetch()} />;
  if (modes.isError) return <ErrorState error={modes.error} onRetry={() => void modes.refetch()} />;
  if (routes.isError) return <ErrorState error={routes.error} onRetry={() => void routes.refetch()} />;

  const routeList = routes.data ?? [];
  const modeList = modes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} overflow={<CopyLinkItem />} />

      <div className="flex items-center">
        <ButtonGroup label={t.title}>
          <ButtonGroupItem
            selected={individual}
            onClick={() => setBrief({ view: "individual" satisfies EcoView })}
            label={t.modeIndividual}
          />
          <ButtonGroupItem
            selected={!individual}
            onClick={() => setBrief({ view: "compare" satisfies EcoView })}
            label={t.modeCompare}
          />
        </ButtonGroup>
      </div>

      <AISuggestPanel
        tool="eco"
        // The audit's own request (D-229); the comparison has no server-side suggestion.
        context={aiAudit ? { request: aiAudit } : {}}
        actions={["set_param", "open_route"]}
        accepts={acceptsAiAction}
        onAction={applyAiAction}
        disabledReason={
          !individual ? suggestText.individualOnly : !ready ? suggestText.needsBrief : undefined
        }
      />

      <ParamsResultLayout>
        <ParamsPanel>
          {individual ? (
            <div className="flex flex-col gap-6">
              <StepCard title={t.productStep} description={t.productHint}>
                <ComponentsTable
                  components={resolvedComponents}
                  materialOptions={materialOptions}
                  processesOf={(index) => componentDetails[index]?.data?.processes ?? []}
                  processesLoaded={(index) => Boolean(componentDetails[index]?.isSuccess)}
                  routes={routeList}
                  onPatch={patchComponent}
                  onAdd={() => setComponents((list) => [...list, blankComponent(defaults)])}
                  onDuplicate={(index) =>
                    setComponents((list) => [...list, { ...list[index]! }])
                  }
                  onRemove={(index) => setComponents((list) => list.filter((_, i) => i !== index))}
                  onRestore={(draft, index) =>
                    setComponents((list) => [...list.slice(0, index), draft, ...list.slice(index)])
                  }
                />
                <HowToFill />
              </StepCard>

              <StepCard title={t.transportStep} description={t.legsHint}>
                <LegsTable
                  legs={resolvedLegs}
                  modes={modeList}
                  onPatch={patchLeg}
                  onAdd={() => setLegs((list) => [...list, blankLeg("0")])}
                  onDuplicate={(index) => setLegs((list) => [...list, { ...list[index]! }])}
                  onRemove={(index) => setLegs((list) => list.filter((_, i) => i !== index))}
                  onRestore={(draft, index) =>
                    setLegs((list) => [...list.slice(0, index), draft, ...list.slice(index)])
                  }
                />
              </StepCard>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {(["a", "b"] as const).map((key, index) => (
                <StepCard
                  key={key}
                  title={key === "a" ? t.materialA : t.materialB}
                  bodyClassName="flex flex-col gap-4"
                >
                  <ScenarioFields
                    name={key.toUpperCase()}
                    draft={resolvedSides[index]!}
                    materialOptions={materialOptions}
                    processes={sideDetails[index]?.data?.processes ?? []}
                    processesLoaded={Boolean(sideDetails[index]?.isSuccess)}
                    routes={routeList}
                    onChange={(patch) => patchSide(key, patch)}
                  />
                </StepCard>
              ))}
              <StepCard title={t.transportStep} bodyClassName="grid gap-4 sm:grid-cols-2">
                <TransportModeSelect
                  modes={modeList}
                  value={selectedMode}
                  onChange={(mode) => setBrief({ mode })}
                />
                <NumberInput
                  label={t.transportDistanceLabel}
                  unit={t.unitKm}
                  value={brief.distance}
                  min={0}
                  step="any"
                  onChange={(event) => setBrief({ distance: event.target.value })}
                />
              </StepCard>
            </div>
          )}

          <StepCard
            title={individual ? t.useStep : t.sharedPremises}
            description={t.useHint}
          >
            <PremisesPanel defaults={defaults} premises={premises} onChange={patchPremises} />
          </StepCard>
        </ParamsPanel>

        <ResultPanel busy={live.updating}>
          {individual ? (
            <StepCard title={t.resultStep} actions={live.updating ? <Updating /> : undefined}>
              <LiveError error={live.error} />
              {result ? (
                <>
                  <EcoExportMenu brief={resultBrief} />
                  <div className="flex flex-col gap-3">
                    <span className="text-body font-medium text-ink">{t.dominanceTitle}</span>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Podium label={t.dominanceEnergy} dominance={result.energy_dominance} />
                      <Podium label={t.dominanceCarbon} dominance={result.carbon_dominance} />
                    </div>
                  </div>

                  <PhaseTable result={result} />
                  {resultBrief ? (
                    <PremisesSummary use={resultBrief.use} transportKm={result.transport_distance_km} />
                  ) : null}
                  <WaterfallPair result={result} exportPrefix="cascata-eco" />
                  <ComponentTable result={result} />
                  <LegTable result={result} />

                  <div className="well flex flex-col gap-2 text-caption text-ink-muted">
                    <span>
                      <strong className="text-ink">{t.massBought}:</strong>{" "}
                      {formatNumber(result.mass_bought)} kg — {t.massBoughtHint}
                    </span>
                    <span>{result.recycling_credit_note}</span>
                    <span>
                      {t.productSummary(result.components.length, result.transport_legs.length)}
                    </span>
                  </div>
                </>
              ) : live.error ? null : (
                <EmptyState title={t.resultIdleTitle} description={blocked?.reason ?? t.resultIdleHint} />
              )}
            </StepCard>
          ) : (
            <StepCard title={t.compareResultStep} actions={live.updating ? <Updating /> : undefined}>
              <LiveError error={live.error} />
              {compareResult ? (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Winner
                      title={t.winnerEnergy}
                      tone="success"
                      winner={compareResult.winner_energy}
                      result={compareResult}
                      tie={t.tieEnergy}
                      savings={
                        compareResult.delta_energy_percent !== null &&
                        Math.abs(compareResult.delta_energy_percent) > 0.01
                          ? t.savingsEnergy(Math.abs(compareResult.delta_energy_percent))
                          : null
                      }
                    />
                    <Winner
                      title={t.winnerCarbon}
                      tone="brand"
                      winner={compareResult.winner_carbon}
                      result={compareResult}
                      tie={t.tieCarbon}
                      savings={
                        compareResult.delta_carbon_percent !== null &&
                        Math.abs(compareResult.delta_carbon_percent) > 0.01
                          ? t.savingsCarbon(Math.abs(compareResult.delta_carbon_percent))
                          : null
                      }
                    />
                  </div>

                  <ComparisonTable result={compareResult} />
                  <PremisesSummary
                    use={(liveCompare.dataRequest ?? comparisonBrief()).use}
                    transportKm={(liveCompare.dataRequest ?? comparisonBrief()).transport_distance_km}
                  />

                  <div className="flex flex-col gap-4">
                    <PhaseBars
                      title={ecoPhaseI18n.energyChartCompareTitle}
                      unit={compareResult.material_a.energy_unit}
                      rows={compareRows(compareResult, "energy")}
                    />
                    <PhaseBars
                      title={ecoPhaseI18n.carbonChartCompareTitle}
                      unit={compareResult.material_a.carbon_unit}
                      rows={compareRows(compareResult, "carbon")}
                    />
                  </div>

                  {(
                    [
                      ["A", compareResult.material_a],
                      ["B", compareResult.material_b],
                    ] as const
                  ).map(([name, side]) => (
                    <Disclosure
                      key={name}
                      summary={ecoPhaseI18n.waterfall.scenarioSummary(name, side.material_name ?? "")}
                    >
                      <WaterfallPair result={side} exportPrefix={`cascata-eco-${name.toLowerCase()}`} />
                    </Disclosure>
                  ))}
                </div>
              ) : live.error ? null : (
                <EmptyState title={t.resultIdleTitle} description={blocked?.reason ?? t.resultIdleHint} />
              )}
            </StepCard>
          )}
        </ResultPanel>
      </ParamsResultLayout>
    </div>
  );
}

function LiveError({ error }: { error: unknown }) {
  return error ? <Alert tone="danger">{describeApiError(error, t.title)}</Alert> : null;
}

function Updating() {
  return <span className="text-caption text-ink-muted">{ptBR.ui.updating}</span>;
}

function Winner({
  title,
  tone,
  winner,
  result,
  tie,
  savings,
}: {
  title: string;
  tone: "success" | "brand";
  winner: EcoComparisonResult["winner_energy"];
  result: EcoComparisonResult;
  tie: string;
  savings: string | null;
}) {
  return (
    <div className="well flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body font-medium text-ink">{title}</span>
        <Badge tone={tone}>
          {winner === "material_a"
            ? result.material_a.material_name
            : winner === "material_b"
              ? result.material_b.material_name
              : tie}
        </Badge>
      </div>
      {savings ? <span className="text-caption text-ink-muted">{savings}</span> : null}
    </div>
  );
}
