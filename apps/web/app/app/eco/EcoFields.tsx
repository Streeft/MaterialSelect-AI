"use client";

import type { ReactNode } from "react";
import type { EndOfLifeRoute, EndOfLifeRouteInfo, TransportMode } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import {
  Alert,
  Button,
  Combobox,
  Input,
  NumberInput,
  Select,
  SelectOption,
} from "@/components/ui";
import type { ComponentDraft, LegDraft, ScenarioDraft } from "./ecoBrief";

const t = ptBR.eco;

export interface MaterialOption {
  value: string;
  label: string;
  description: string;
  keywords: string[];
}

export interface ProcessOption {
  id: number;
  name: string;
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

/** What every part of a product or scenario has: material, process, mass, recycled share, end of life. */
interface PartDraft {
  material: string;
  process: string;
  mass: string;
  recycled: string;
  endOfLife: EndOfLifeRoute;
}

/**
 * The five fields a single part is described by.
 *
 * One component for the product's lines and for the two scenarios of a
 * comparison (D-216): they ask the reader the same question, and keeping two
 * copies of the form is how the A and B sides of a screen drift apart.
 */
export function PartFields({
  draft,
  materialOptions,
  processes,
  processesLoaded,
  routes,
  massLabel,
  massHint,
  afterMass,
  onChange,
}: {
  draft: PartDraft;
  materialOptions: MaterialOption[];
  processes: ProcessOption[];
  processesLoaded: boolean;
  routes: EndOfLifeRouteInfo[];
  massLabel: string;
  massHint?: string;
  /** A field that sits right after the mass (the component's quantity). */
  afterMass?: ReactNode;
  onChange: (patch: Partial<PartDraft>) => void;
}) {
  const selectedProcess = draft.process || String(processes[0]?.id ?? "");
  return (
    <>
      <Combobox
        label={t.materialLabel}
        hint={t.materialHint}
        options={materialOptions}
        value={draft.material}
        onChange={(value) => onChange({ material: value, process: "" })}
      />
      {processesLoaded && processes.length === 0 ? (
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
          onChange={(event) => onChange({ process: (event.target as HTMLSelectElement).value })}
        >
          {processes.map((process) => (
            <SelectOption key={process.id} value={String(process.id)}>
              {process.name}
            </SelectOption>
          ))}
        </Select>
      )}
      <NumberInput
        label={massLabel}
        hint={massHint}
        value={draft.mass}
        min={0}
        step="any"
        onChange={(event) => onChange({ mass: event.target.value })}
      />
      {afterMass}
      <NumberInput
        label={t.recycledLabel}
        hint={t.recycledHint}
        value={draft.recycled}
        min={0}
        max={1}
        step="any"
        onChange={(event) => onChange({ recycled: event.target.value })}
      />
      <Select
        label={t.eolLabel}
        hint={t.eolHint}
        value={draft.endOfLife}
        onChange={(event) =>
          onChange({ endOfLife: (event.target as HTMLSelectElement).value as EndOfLifeRoute })
        }
      >
        <RouteOptions routes={routes} />
      </Select>
    </>
  );
}

export function ComponentFields({
  index,
  draft,
  canRemove,
  materialOptions,
  processes,
  processesLoaded,
  routes,
  onChange,
  onRemove,
}: {
  index: number;
  draft: ComponentDraft;
  canRemove: boolean;
  materialOptions: MaterialOption[];
  processes: ProcessOption[];
  processesLoaded: boolean;
  routes: EndOfLifeRouteInfo[];
  onChange: (patch: Partial<ComponentDraft>) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  return (
    <fieldset className="subsection grid min-w-0 gap-4 sm:grid-cols-2">
      <legend className="text-body font-medium text-ink">{t.componentLegend(n)}</legend>
      <div className="sm:col-span-2">
        <Input
          label={t.componentNameLabel}
          hint={t.componentNameHint}
          value={draft.name}
          maxLength={120}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <PartFields
        draft={draft}
        materialOptions={materialOptions}
        processes={processes}
        processesLoaded={processesLoaded}
        routes={routes}
        massLabel={index === 0 ? t.massLabel : t.unitMassLabel}
        massHint={index === 0 ? t.massHint : undefined}
        afterMass={
          <NumberInput
            label={t.quantityLabel}
            value={draft.quantity}
            min={1}
            step={1}
            onChange={(event) => onChange({ quantity: event.target.value })}
          />
        }
        onChange={onChange}
      />
      {canRemove ? (
        <div className="sm:col-span-2">
          <Button variant="ghost" size="sm" onClick={onRemove}>
            {t.removeComponent(n)}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * One alternative of a comparison — the same component rendered for A and for B
 * (D-216). It holds no state: the scenario lives in the URL and arrives as
 * `draft`, so A and B are two values of one shape, never two copies of a form.
 */
export function ScenarioFields({
  name,
  draft,
  materialOptions,
  processes,
  processesLoaded,
  routes,
  onChange,
}: {
  /** "A" or "B". */
  name: string;
  draft: ScenarioDraft;
  materialOptions: MaterialOption[];
  processes: ProcessOption[];
  processesLoaded: boolean;
  routes: EndOfLifeRouteInfo[];
  onChange: (patch: Partial<ScenarioDraft>) => void;
}) {
  return (
    <fieldset
      className="grid min-w-0 gap-4 sm:grid-cols-2"
      data-scenario={name}
    >
      <legend className="sr-only">{ecoPhaseI18n.scenarioLegend(name)}</legend>
      <PartFields
        draft={draft}
        materialOptions={materialOptions}
        processes={processes}
        processesLoaded={processesLoaded}
        routes={routes}
        massLabel={t.massLabel}
        massHint={t.massHint}
        onChange={onChange}
      />
    </fieldset>
  );
}

export function LegFields({
  index,
  draft,
  canRemove,
  modes,
  onChange,
  onRemove,
}: {
  index: number;
  draft: LegDraft;
  canRemove: boolean;
  modes: TransportMode[];
  onChange: (patch: Partial<LegDraft>) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  return (
    <fieldset className="subsection grid min-w-0 gap-4 sm:grid-cols-2">
      <legend className="text-body font-medium text-ink">{t.legLegend(n)}</legend>
      <TransportModeSelect modes={modes} value={draft.mode} onChange={(mode) => onChange({ mode })} />
      <NumberInput
        label={t.transportDistanceLabel}
        value={draft.distance}
        min={0}
        step="any"
        onChange={(event) => onChange({ distance: event.target.value })}
      />
      {canRemove ? (
        <div className="sm:col-span-2">
          <Button variant="ghost" size="sm" onClick={onRemove}>
            {t.removeLeg(n)}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

export function TransportModeSelect({
  modes,
  value,
  onChange,
}: {
  modes: TransportMode[];
  value: string;
  onChange: (mode: string) => void;
}) {
  return (
    <Select
      label={t.transportModeLabel}
      value={value}
      onChange={(event) => onChange((event.target as HTMLSelectElement).value)}
    >
      {modes.map((item) => (
        <SelectOption key={item.slug} value={item.slug}>
          {item.name}
        </SelectOption>
      ))}
    </Select>
  );
}
