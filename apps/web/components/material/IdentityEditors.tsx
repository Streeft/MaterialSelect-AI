"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { replaceMaterialComposition, replaceMaterialDesignations } from "@/lib/api";
import type {
  CompositionEntry,
  CompositionEntryIn,
  CompositionState,
  Designation,
  DesignationIn,
  DesignationSystem,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { Button, Card, CardBody, IconButton, Input, Select, SelectOption } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/ui/icons";

const t = ptBR.detail.edit;

/** The units a composition may be written in, as the backend accepts them (mass basis). */
const UNITS = ["%", "ppm", "wt%", "fração mássica"];
const SYSTEMS: DesignationSystem[] = [
  "UNS", "AISI_SAE", "ASTM", "EN", "ISO", "DIN", "JIS", "GB", "ABNT", "COMERCIAL",
];

/** Decimal comma or point; empty is "not stated", never zero (principle 3). */
function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : NaN;
}

function format(value: number | null): string {
  return value === null ? "" : String(value).replace(".", ",");
}

// --- Composition -------------------------------------------------------------

interface CompositionRow {
  key: number;
  element: string;
  state: CompositionState;
  min: string;
  max: string;
  nominal: string;
  unit: string;
  source: string;
  citation: string;
}

let rowKey = 0;

function compositionRowFrom(entry: CompositionEntry): CompositionRow {
  return {
    key: rowKey++,
    element: entry.element,
    state: entry.state,
    // What the source wrote, in the unit it wrote it: editing never rewrites
    // the original into the canonical number.
    min: format(entry.value_min),
    max: format(entry.value_max),
    nominal: format(entry.value_nominal),
    unit: entry.original_unit ?? "%",
    source: entry.source_label,
    citation: entry.citation ?? "",
  };
}

function toCompositionIn(row: CompositionRow): CompositionEntryIn | string {
  const base = {
    element: row.element.trim(),
    state: row.state,
    source_label: row.source.trim(),
    citation: row.citation.trim() || null,
  };
  if (row.state !== "faixa") return base;
  const [min, max, nominal] = [row.min, row.max, row.nominal].map(parseNumber);
  if ([min, max, nominal].some((n) => typeof n === "number" && Number.isNaN(n))) {
    return t.invalidNumber(base.element);
  }
  return { ...base, value_min: min, value_max: max, value_nominal: nominal, unit: row.unit };
}

export function CompositionEditor({
  materialId,
  entries,
  onDone,
}: {
  materialId: number;
  entries: CompositionEntry[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<CompositionRow[]>(() => entries.map(compositionRowFrom));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (payload: CompositionEntryIn[]) => replaceMaterialComposition(materialId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["material", materialId] });
      onDone();
    },
    onError: (e: Error) => setProblem(e.message),
  });

  const update = (key: number, patch: Partial<CompositionRow>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = () => {
    const built = rows.map(toCompositionIn);
    const error = built.find((b): b is string => typeof b === "string");
    if (error) return setProblem(error);
    setProblem(null);
    save.mutate(built as CompositionEntryIn[]);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-xs text-ink-muted">{t.compositionRule}</p>
      {rows.map((row, i) => (
        <Card as="fieldset" key={row.key}>
          <legend className="sr-only">{t.rowLabel(i + 1)}</legend>
          <CardBody className="flex flex-wrap items-end gap-3">
            <Input
              label={t.element}
              className="w-20"
              value={row.element}
              onChange={(e) => update(row.key, { element: e.target.value })}
            />
            <Select
              label={t.state}
              className="w-40"
              value={row.state}
              onChange={(e) => update(row.key, { state: e.target.value as CompositionState })}
            >
              <SelectOption value="faixa">{t.stateRange}</SelectOption>
              <SelectOption value="resto">{t.stateBalance}</SelectOption>
              <SelectOption value="ausente">{t.stateAbsent}</SelectOption>
            </Select>
            {row.state === "faixa" && (
              <>
                <Input
                  label={t.min}
                  className="w-24 tabular-nums"
                  inputMode="decimal"
                  value={row.min}
                  onChange={(e) => update(row.key, { min: e.target.value })}
                />
                <Input
                  label={t.max}
                  className="w-24 tabular-nums"
                  inputMode="decimal"
                  value={row.max}
                  onChange={(e) => update(row.key, { max: e.target.value })}
                />
                <Input
                  label={t.nominal}
                  className="w-24 tabular-nums"
                  inputMode="decimal"
                  value={row.nominal}
                  onChange={(e) => update(row.key, { nominal: e.target.value })}
                />
                <Select
                  label={t.unit}
                  className="w-32"
                  value={row.unit}
                  onChange={(e) => update(row.key, { unit: e.target.value })}
                >
                  {UNITS.map((u) => (
                    <SelectOption key={u} value={u}>
                      {u}
                    </SelectOption>
                  ))}
                </Select>
              </>
            )}
            <Input
              label={t.source}
              className="w-56"
              value={row.source}
              onChange={(e) => update(row.key, { source: e.target.value })}
            />
            <Input
              label={t.citation}
              className="w-44"
              value={row.citation}
              onChange={(e) => update(row.key, { citation: e.target.value })}
            />
            <IconButton
              className="ml-auto"
              size="sm"
              label={`${ptBR.actions.remove}: ${t.rowLabel(i + 1)}`}
              icon={<IconTrash />}
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            />
          </CardBody>
        </Card>
      ))}
      {rows.length === 0 && <p className="text-sm text-ink-muted">{t.emptyComposition}</p>}
      {problem && (
        <p role="alert" className="text-sm text-danger-fg">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<IconPlus />}
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: rowKey++,
                element: "",
                state: "faixa",
                min: "",
                max: "",
                nominal: "",
                unit: "%",
                // The previous row's source is the likely one; still editable.
                source: current[current.length - 1]?.source ?? "",
                citation: "",
              },
            ])
          }
        >
          {t.addElement}
        </Button>
        <Button type="submit" size="sm" loading={save.isPending}>
          {ptBR.actions.save}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {ptBR.actions.cancel}
        </Button>
      </div>
    </form>
  );
}

// --- Designations ------------------------------------------------------------

interface DesignationRow {
  key: number;
  system: DesignationSystem;
  code: string;
  region: string;
  source: string;
  citation: string;
}

export function DesignationEditor({
  materialId,
  designations,
  onDone,
}: {
  materialId: number;
  designations: Designation[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<DesignationRow[]>(() =>
    designations.map((d) => ({
      key: rowKey++,
      system: d.system,
      code: d.code,
      region: d.region ?? "",
      source: d.source_label,
      citation: d.citation ?? "",
    })),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (payload: DesignationIn[]) => replaceMaterialDesignations(materialId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["material", materialId] });
      onDone();
    },
    onError: (e: Error) => setProblem(e.message),
  });
  const update = (key: number, patch: Partial<DesignationRow>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setProblem(null);
        save.mutate(
          rows.map((r) => ({
            system: r.system,
            code: r.code.trim(),
            region: r.region.trim() || null,
            source_label: r.source.trim(),
            citation: r.citation.trim() || null,
          })),
        );
      }}
    >
      <p className="text-xs text-ink-muted">{t.designationRule}</p>
      {rows.map((row, i) => (
        <Card as="fieldset" key={row.key}>
          <legend className="sr-only">{t.rowLabel(i + 1)}</legend>
          <CardBody className="flex flex-wrap items-end gap-3">
            <Select
              label={t.system}
              className="w-40"
              value={row.system}
              onChange={(e) => update(row.key, { system: e.target.value as DesignationSystem })}
            >
              {SYSTEMS.map((s) => (
                <SelectOption key={s} value={s}>
                  {ptBR.detail.systemNames[s]}
                </SelectOption>
              ))}
            </Select>
            <Input
              label={t.code}
              className="w-40"
              value={row.code}
              onChange={(e) => update(row.key, { code: e.target.value })}
            />
            <Input
              label={t.region}
              className="w-32"
              value={row.region}
              onChange={(e) => update(row.key, { region: e.target.value })}
            />
            <Input
              label={t.source}
              className="w-56"
              value={row.source}
              onChange={(e) => update(row.key, { source: e.target.value })}
            />
            <Input
              label={t.citation}
              className="w-44"
              value={row.citation}
              onChange={(e) => update(row.key, { citation: e.target.value })}
            />
            <IconButton
              className="ml-auto"
              size="sm"
              label={`${ptBR.actions.remove}: ${t.rowLabel(i + 1)}`}
              icon={<IconTrash />}
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            />
          </CardBody>
        </Card>
      ))}
      {problem && (
        <p role="alert" className="text-sm text-danger-fg">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<IconPlus />}
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: rowKey++,
                system: "UNS",
                code: "",
                region: "",
                source: current[current.length - 1]?.source ?? "",
                citation: "",
              },
            ])
          }
        >
          {t.addDesignation}
        </Button>
        <Button type="submit" size="sm" loading={save.isPending}>
          {ptBR.actions.save}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {ptBR.actions.cancel}
        </Button>
      </div>
    </form>
  );
}
