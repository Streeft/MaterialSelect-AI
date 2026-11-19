"use client";

import { describeApiError } from "@/lib/errors";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMaterialCompositionEntry,
  deleteMaterialCompositionEntry,
  listSources,
  replaceMaterialComposition,
  replaceMaterialDesignations,
  updateMaterialCompositionEntry,
} from "@/lib/api";
import type {
  CompositionEntry,
  CompositionEntryIn,
  CompositionState,
  DataQuality,
  Designation,
  DesignationIn,
  DesignationSystem,
  MaterialDetail,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  IconButton,
  Input,
  Select,
  SelectOption,
} from "@/components/ui";
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

const QUALITIES: DataQuality[] = ["MEDIDO", "IMPORTADO", "ESTIMADO"];

interface CompositionRow {
  key: number;
  /** TM2-g (D-255): the stored row; `null` for a row not written yet. */
  id: number | null;
  element: string;
  /** TM2-c: empty is "no condition stated". */
  condition: string;
  state: CompositionState;
  min: string;
  max: string;
  nominal: string;
  unit: string;
  /** TM2-f (D-255): said per row, never assumed; "" until chosen. */
  quality: DataQuality | "";
  /** TM2-f: a registered source's id, or "" for a new one typed in `source`. */
  sourceId: string;
  source: string;
  citation: string;
}

let rowKey = 0;

function compositionRowFrom(entry: CompositionEntry): CompositionRow {
  return {
    key: rowKey++,
    id: entry.id ?? null,
    element: entry.element,
    condition: entry.condition_label ?? "",
    state: entry.state,
    // What the source wrote, in the unit it wrote it: editing never rewrites
    // the original into the canonical number.
    min: format(entry.value_min),
    max: format(entry.value_max),
    nominal: format(entry.value_nominal),
    unit: entry.original_unit ?? "%",
    quality: entry.data_quality,
    sourceId: entry.source_id != null ? String(entry.source_id) : "",
    source: entry.source_label,
    citation: entry.citation ?? "",
  };
}

function toCompositionIn(row: CompositionRow): CompositionEntryIn | string {
  const element = row.element.trim();
  if (row.quality === "") return t.qualityRequired(element);
  const source =
    row.sourceId !== ""
      ? { source_id: Number(row.sourceId) }
      : row.source.trim() !== ""
        ? { source_label: row.source.trim() }
        : null;
  if (source === null) return t.sourceRequired(element);
  const base = {
    element,
    state: row.state,
    condition_label: row.condition.trim() || null,
    ...source,
    citation: row.citation.trim() || null,
    data_quality: row.quality,
  };
  if (row.state !== "faixa") return base;
  const [min, max, nominal] = [row.min, row.max, row.nominal].map(parseNumber);
  if ([min, max, nominal].some((n) => typeof n === "number" && Number.isNaN(n))) {
    return t.invalidNumber(base.element);
  }
  return { ...base, value_min: min, value_max: max, value_nominal: nominal, unit: row.unit };
}

/** The stored row a per-row write came back as, found by its place (condition, element). */
function storedRowFor(detail: MaterialDetail, row: CompositionRow): CompositionEntry | undefined {
  const condition = row.condition.trim() || null;
  const element = row.element.trim().toLowerCase();
  return detail.composition.find(
    (e) => e.element.toLowerCase() === element && (e.condition_label ?? null) === condition,
  );
}

export function CompositionEditor({
  materialId,
  entries,
  materialIsDemo = false,
  onDone,
}: {
  materialId: number;
  entries: CompositionEntry[];
  /** A real record is never offered a demonstration source (the backend refuses it too). */
  materialIsDemo?: boolean;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<CompositionRow[]>(() => entries.map(compositionRowFrom));
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ row: CompositionRow; n: number } | null>(null);
  const sources = useQuery({ queryKey: ["sources"], queryFn: listSources, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: (payload: CompositionEntryIn[]) => replaceMaterialComposition(materialId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["material", materialId] });
      onDone();
    },
    onError: (e: Error) => setProblem(describeApiError(e)),
  });
  // TM2-g: one row at a time — the others stay as stored, and as typed here.
  const saveRow = useMutation({
    mutationFn: ({ row, payload }: { row: CompositionRow; payload: CompositionEntryIn; n: number }) =>
      row.id === null
        ? addMaterialCompositionEntry(materialId, payload)
        : updateMaterialCompositionEntry(materialId, row.id, payload),
    onSuccess: async (detail, { row, n }) => {
      const stored = storedRowFor(detail, row);
      if (stored) {
        setRows((current) =>
          current.map((r) => (r.key === row.key ? { ...compositionRowFrom(stored), key: r.key } : r)),
        );
      }
      setNotice(t.rowSaved(n));
      await qc.invalidateQueries({ queryKey: ["material", materialId] });
    },
    onError: (e: Error) => setProblem(describeApiError(e)),
  });
  const removeRow = useMutation({
    mutationFn: (row: CompositionRow) => deleteMaterialCompositionEntry(materialId, row.id as number),
    onSuccess: async (_detail, row) => {
      setRows((current) => current.filter((r) => r.key !== row.key));
      setRemoving(null);
      setNotice(t.rowRemoved);
      await qc.invalidateQueries({ queryKey: ["material", materialId] });
    },
    onError: (e: Error) => {
      setRemoving(null);
      setProblem(describeApiError(e));
    },
  });

  const sourceOptions = (sources.data ?? []).filter((s) => materialIsDemo || !s.is_demo);

  const update = (key: number, patch: Partial<CompositionRow>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = () => {
    const built = rows.map(toCompositionIn);
    const error = built.find((b): b is string => typeof b === "string");
    if (error) return setProblem(error);
    setProblem(null);
    setNotice(null);
    save.mutate(built as CompositionEntryIn[]);
  };

  const submitRow = (row: CompositionRow, n: number) => {
    const payload = toCompositionIn(row);
    if (typeof payload === "string") return setProblem(payload);
    setProblem(null);
    setNotice(null);
    saveRow.mutate({ row, payload, n });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-caption text-ink-muted">{t.compositionRule}</p>
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
            <Input
              label={t.condition}
              className="w-40"
              maxLength={60}
              value={row.condition}
              onChange={(e) => update(row.key, { condition: e.target.value })}
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
            <Select
              label={t.quality}
              className="w-36"
              value={row.quality}
              onChange={(e) => update(row.key, { quality: e.target.value as DataQuality | "" })}
            >
              {row.quality === "" && <SelectOption value="">{t.qualityPick}</SelectOption>}
              {QUALITIES.map((q) => (
                <SelectOption key={q} value={q}>
                  {ptBR.quality[q]}
                </SelectOption>
              ))}
            </Select>
            <Select
              label={t.source}
              className="w-56"
              value={row.sourceId}
              onChange={(e) => {
                const chosen = sourceOptions.find((s) => String(s.id) === e.target.value);
                update(row.key, {
                  sourceId: e.target.value,
                  source: chosen ? chosen.label : e.target.value === "" ? "" : row.source,
                });
              }}
            >
              <SelectOption value="">{t.newSource}</SelectOption>
              {/* The row's own source stays choosable while the list loads or
                  when it is not in it. */}
              {row.sourceId !== "" && !sourceOptions.some((s) => String(s.id) === row.sourceId) && (
                <SelectOption value={row.sourceId}>{row.source}</SelectOption>
              )}
              {sourceOptions.map((s) => (
                <SelectOption key={s.id} value={String(s.id)}>
                  {s.label}
                </SelectOption>
              ))}
            </Select>
            {row.sourceId === "" && (
              <Input
                label={t.newSourceLabel}
                className="w-56"
                value={row.source}
                onChange={(e) => update(row.key, { source: e.target.value })}
              />
            )}
            <Input
              label={t.citation}
              className="w-44"
              value={row.citation}
              onChange={(e) => update(row.key, { citation: e.target.value })}
            />
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={saveRow.isPending && saveRow.variables?.row.key === row.key}
                onClick={() => submitRow(row, i + 1)}
              >
                {t.saveRow(i + 1)}
              </Button>
              <IconButton
                size="sm"
                label={`${ptBR.actions.remove}: ${t.rowLabel(i + 1)}`}
                icon={<IconTrash />}
                onClick={() =>
                  row.id === null
                    ? setRows((current) => current.filter((r) => r.key !== row.key))
                    : setRemoving({ row, n: i + 1 })
                }
              />
            </div>
          </CardBody>
        </Card>
      ))}
      {rows.length === 0 && <p className="text-body text-ink-muted">{t.emptyComposition}</p>}
      {problem && (
        <p role="alert" className="text-body text-danger-fg">
          {problem}
        </p>
      )}
      {notice && !problem && (
        <p role="status" className="text-body text-ink-muted">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<IconPlus />}
          onClick={() =>
            setRows((current) => {
              const last = current[current.length - 1];
              return [
                ...current,
                {
                  key: rowKey++,
                  id: null,
                  element: "",
                  // Rows of one condition are usually typed together.
                  condition: last?.condition ?? "",
                  state: "faixa",
                  min: "",
                  max: "",
                  nominal: "",
                  unit: "%",
                  // TM2-f: the previous row's quality and source are the likely
                  // ones; still editable, and a first row asks for both.
                  quality: last?.quality ?? "",
                  sourceId: last?.sourceId ?? "",
                  source: last?.source ?? "",
                  citation: "",
                },
              ];
            })
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
      <ConfirmDialog
        open={removing !== null}
        title={removing ? t.removeRowTitle(removing.n) : ""}
        message={t.removeRowMessage}
        confirmLabel={ptBR.actions.remove}
        pending={removeRow.isPending}
        onConfirm={() => removing && removeRow.mutate(removing.row)}
        onCancel={() => setRemoving(null)}
      />
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
    onError: (e: Error) => setProblem(describeApiError(e)),
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
      <p className="text-caption text-ink-muted">{t.designationRule}</p>
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
        <p role="alert" className="text-body text-danger-fg">
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
