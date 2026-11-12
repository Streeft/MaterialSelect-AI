"use client";

import type { ReactNode } from "react";
import type { EndOfLifeRoute, EndOfLifeRouteInfo, TransportMode } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import {
  Alert,
  Combobox,
  Disclosure,
  InlineTable,
  Input,
  NumberInput,
  Select,
  SelectOption,
  type InlineColumn,
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
        unit={t.unitKg}
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
 * D-219: the bill of materials as a table edited in place — one row per
 * component, "+ Adicionar componente" under the last, ⋯ per row with Duplicar
 * and Remover (Desfazer). The list is positional (it lives in the URL, D-216),
 * so a row is its index. Each control names itself by column and row, so a
 * screen reader hears "Massa de uma unidade, Componente 2 (kg)".
 */
export function ComponentsTable({
  components,
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
  /** Resolved: the material and process on screen, defaults applied. */
  components: ComponentDraft[];
  materialOptions: MaterialOption[];
  processesOf: (index: number) => ProcessOption[];
  processesLoaded: (index: number) => boolean;
  routes: EndOfLifeRouteInfo[];
  onPatch: (index: number, patch: Partial<ComponentDraft>) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onRestore: (draft: ComponentDraft, index: number) => void;
}) {
  return (
    <InlineTable
      label={t.componentsTable}
      columns={COMPONENT_COLUMNS}
      stackBelow="md"
      rows={components}
      rowKey={(_draft, index) => index}
      rowName={(_draft, index) => t.componentLegend(index + 1)}
      onAdd={onAdd}
      addLabel={t.addComponent}
      onDuplicate={(_draft, index) => onDuplicate(index)}
      onRemove={(_draft, index) => onRemove(index)}
      onRestore={onRestore}
      renderCell={(draft, column, index) => {
        const cell = (header: string) => t.cellLabel(header, t.componentLegend(index + 1));
        const processes = processesOf(index);
        const patch = (change: Partial<ComponentDraft>) => onPatch(index, change);
        switch (column.id) {
          case "name":
            return (
              <Input
                label={cell(t.colName)}
                placeholder={t.componentNamePlaceholder}
                value={draft.name}
                maxLength={120}
                onChange={(event) => patch({ name: event.target.value })}
              />
            );
          case "material":
            return (
              <Combobox
                label={cell(t.colMaterial)}
                options={materialOptions}
                value={draft.material}
                onChange={(value) => patch({ material: value, process: "" })}
              />
            );
          case "process":
            return processesLoaded(index) && processes.length === 0 ? (
              <span className="text-support text-ink-muted">{t.noProcessShort}</span>
            ) : (
              <Select
                label={cell(t.colProcess)}
                value={draft.process}
                disabled={processes.length === 0}
                onChange={(event) => patch({ process: (event.target as HTMLSelectElement).value })}
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
                onChange={(event) => patch({ mass: event.target.value })}
              />
            );
          case "quantity":
            return (
              <NumberInput
                label={cell(t.colQuantity)}
                value={draft.quantity}
                min={1}
                step={1}
                onChange={(event) => patch({ quantity: event.target.value })}
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
                onChange={(event) => patch({ recycled: event.target.value })}
              />
            );
          default:
            return (
              <Select
                label={cell(t.colEol)}
                value={draft.endOfLife}
                onChange={(event) =>
                  patch({ endOfLife: (event.target as HTMLSelectElement).value as EndOfLifeRoute })
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

/** D-219: what each column of the product table asks, one click away instead of under every field. */
export function HowToFill() {
  return (
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

const LEG_COLUMNS: InlineColumn[] = [
  { id: "mode", header: t.colMode, minWidth: "10rem" },
  { id: "distance", header: t.colDistance, hint: t.unitKm, numeric: true, minWidth: "8rem" },
];

/** D-219: the transport legs as a table edited in place, like the product. */
export function LegsTable({
  legs,
  modes,
  onPatch,
  onAdd,
  onDuplicate,
  onRemove,
  onRestore,
}: {
  /** Resolved: the mode on screen, defaults applied. */
  legs: LegDraft[];
  modes: TransportMode[];
  onPatch: (index: number, patch: Partial<LegDraft>) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onRestore: (draft: LegDraft, index: number) => void;
}) {
  return (
    <InlineTable
      label={t.legsTable}
      columns={LEG_COLUMNS}
      rows={legs}
      rowKey={(_draft, index) => index}
      rowName={(_draft, index) => t.legLegend(index + 1)}
      onAdd={onAdd}
      addLabel={t.addLeg}
      onDuplicate={(_draft, index) => onDuplicate(index)}
      onRemove={(_draft, index) => onRemove(index)}
      onRestore={onRestore}
      renderCell={(draft, column, index) => {
        const row = t.legLegend(index + 1);
        return column.id === "mode" ? (
          <Select
            label={t.cellLabel(t.colMode, row)}
            value={draft.mode}
            onChange={(event) => onPatch(index, { mode: (event.target as HTMLSelectElement).value })}
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
            onChange={(event) => onPatch(index, { distance: event.target.value })}
          />
        );
      }}
    />
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
