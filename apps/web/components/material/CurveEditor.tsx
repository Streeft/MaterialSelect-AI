"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMaterialCurve, listCurveKinds, replaceMaterialCurve } from "@/lib/api";
import type { Curve, CurveIn, CurveKind, CurveKindSpec, CurveQuantityOption } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Button,
  Card,
  CardBody,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  Select,
  SelectOption,
  Textarea,
} from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/ui/icons";

const t = ptBR.curves.edit;

interface SeriesState {
  key: number;
  label: string;
  conditions: string;
  parameter: string;
  parameterUnit: string;
  /** One point per line: `x; y` or `x; y; y mín.; y máx.`, in the original units. */
  points: string;
}

let seriesKey = 0;

const comma = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

function parseNumber(text: string): number {
  return Number(text.trim().replace(",", "."));
}

/**
 * Parse the points box. Only reading what was typed: no sorting, no filling —
 * the builder on the server refuses a curve out of order rather than fixing it.
 * Returns the points or the sentence that says which line is wrong.
 */
export function parsePoints(
  text: string,
  seriesNumber: number,
): { points: CurveIn["series"][number]["points"] } | { error: string } {
  const points: CurveIn["series"][number]["points"] = [];
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  for (const [index, line] of lines.entries()) {
    const cells = (line.includes(";") || line.includes("\t")
      ? line.split(/[;\t]/)
      : line.trim().split(/\s+/)
    ).map((c) => c.trim());
    if (cells.length !== 2 && cells.length !== 4) {
      return { error: t.badLine(seriesNumber, index + 1) };
    }
    const numbers = cells.map(parseNumber);
    if (cells.some((cell, i) => cell === "" || !Number.isFinite(numbers[i]))) {
      return { error: t.badLine(seriesNumber, index + 1) };
    }
    const [x, y, yMin, yMax] = numbers as [number, number, number?, number?];
    points.push(cells.length === 4 ? { x, y, y_min: yMin, y_max: yMax } : { x, y });
  }
  return { points };
}

function pointsText(series: Curve["series"][number]): string {
  return series.points
    .map((p) =>
      p.y_min_original != null && p.y_max_original != null
        ? [p.x_original, p.y_original, p.y_min_original, p.y_max_original].map(comma).join("; ")
        : [p.x_original, p.y_original].map(comma).join("; "),
    )
    .join("\n");
}

function quantityOf(options: CurveQuantityOption[], key: string): CurveQuantityOption | undefined {
  return options.find((q) => q.key === key);
}

/**
 * The form that writes a curve by hand (TM4-d).
 *
 * Its vocabulary — which axes a kind admits, which units — comes from the
 * backend's own table, so nothing offered here can be refused there; what the
 * server still validates (x increasing, a band that contains its line, one point
 * is a scalar) comes back as the message. Points go in as text, one per line, in
 * the units the source used: the original numbers are kept and converted by the
 * server, never by this component.
 */
export function CurveEditor({
  materialId,
  curve,
  onDone,
}: {
  materialId: number;
  /** The curve being replaced, or `undefined` to write a new one. */
  curve?: Curve;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const kinds = useQuery({ queryKey: ["curve-kinds"], queryFn: listCurveKinds, staleTime: Infinity });
  if (kinds.isLoading) return <LoadingState label={ptBR.curves.loading} />;
  if (kinds.isError || !kinds.data) {
    return <ErrorState title={t.kindsError} onRetry={() => void kinds.refetch()} />;
  }
  return (
    <Form
      key={curve?.id ?? "new"}
      materialId={materialId}
      curve={curve}
      specs={kinds.data}
      onDone={onDone}
      onSaved={async () => {
        await qc.invalidateQueries({ queryKey: ["material-curves", materialId] });
        await qc.invalidateQueries({ queryKey: ["material-curve", materialId] });
      }}
    />
  );
}

function Form({
  materialId,
  curve,
  specs,
  onDone,
  onSaved,
}: {
  materialId: number;
  curve?: Curve;
  specs: CurveKindSpec[];
  onDone: () => void;
  onSaved: () => Promise<void>;
}) {
  const first = specs[0]!;
  const [kind, setKind] = useState<CurveKind>(curve?.kind ?? first.kind);
  const spec = specs.find((s) => s.kind === kind) ?? first;
  const [title, setTitle] = useState(curve?.title ?? "");
  const [description, setDescription] = useState(curve?.description ?? "");
  const [xq, setXq] = useState(curve?.x_axis.quantity ?? spec.x_quantities[0]!.key);
  const [xUnit, setXUnit] = useState(
    curve?.x_axis.original_unit ?? spec.x_quantities[0]!.reading_unit,
  );
  const [yq, setYq] = useState(curve?.y_axis.quantity ?? spec.y_quantities[0]!.key);
  const [yUnit, setYUnit] = useState(
    curve?.y_axis.original_unit ?? spec.y_quantities[0]!.reading_unit,
  );
  const [xLabel, setXLabel] = useState(curve?.x_axis.title ?? "");
  const [yLabel, setYLabel] = useState(curve?.y_axis.title ?? "");
  const [pq, setPq] = useState(curve?.parameter?.quantity ?? "");
  const [source, setSource] = useState(curve?.source_label ?? "");
  const [citation, setCitation] = useState(curve?.citation ?? "");
  const [series, setSeries] = useState<SeriesState[]>(() =>
    curve
      ? curve.series.map((s) => ({
          key: seriesKey++,
          label: s.label ?? "",
          conditions: s.conditions ?? "",
          parameter: comma(s.parameter_original),
          parameterUnit: s.parameter_original_unit ?? "",
          points: pointsText(s),
        }))
      : [{ key: seriesKey++, label: "", conditions: "", parameter: "", parameterUnit: "", points: "" }],
  );
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (payload: CurveIn) =>
      curve
        ? replaceMaterialCurve(materialId, curve.id, payload)
        : createMaterialCurve(materialId, payload),
    onSuccess: async () => {
      await onSaved();
      onDone();
    },
    onError: (e: Error) => setProblem(e.message),
  });

  const xOption = quantityOf(spec.x_quantities, xq);
  const yOption = quantityOf(spec.y_quantities, yq);
  const pOption = quantityOf(spec.parameter_quantities, pq);

  function changeKind(next: CurveKind) {
    const nextSpec = specs.find((s) => s.kind === next)!;
    setKind(next);
    setXq(nextSpec.x_quantities[0]!.key);
    setXUnit(nextSpec.x_quantities[0]!.reading_unit);
    setYq(nextSpec.y_quantities[0]!.key);
    setYUnit(nextSpec.y_quantities[0]!.reading_unit);
    setPq("");
  }

  function updateSeries(key: number, patch: Partial<SeriesState>) {
    setSeries((current) => current.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function submit() {
    const built: CurveIn["series"] = [];
    for (const [index, s] of series.entries()) {
      const parsed = parsePoints(s.points, index + 1);
      if ("error" in parsed) return setProblem(parsed.error);
      const parameter = pq ? parseNumber(s.parameter) : null;
      if (pq && !Number.isFinite(parameter)) return setProblem(t.badParameter(index + 1));
      built.push({
        label: s.label.trim() || null,
        conditions: s.conditions.trim() || null,
        parameter,
        parameter_unit: pq ? s.parameterUnit || pOption?.reading_unit || null : null,
        points: parsed.points,
      });
    }
    setProblem(null);
    save.mutate({
      kind,
      title: title.trim(),
      description: description.trim() || null,
      x_quantity: xq,
      x_unit: xUnit,
      y_quantity: yq,
      y_unit: yUnit,
      x_label: xLabel.trim() || null,
      y_label: yLabel.trim() || null,
      parameter_quantity: pq || null,
      series: built,
      source_label: source.trim(),
      citation: citation.trim() || null,
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-xs text-ink-muted">{t.rule}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t.kind}
          className="w-64"
          value={kind}
          disabled={curve !== undefined}
          onChange={(e) => changeKind(e.target.value as CurveKind)}
        >
          {specs.map((s) => (
            <SelectOption key={s.kind} value={s.kind}>
              {s.label}
            </SelectOption>
          ))}
        </Select>
        <Input label={t.titleField} className="w-72" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label={t.source} className="w-56" value={source} onChange={(e) => setSource(e.target.value)} />
        <Input label={t.citation} className="w-48" value={citation} onChange={(e) => setCitation(e.target.value)} />
      </div>
      <Input
        label={t.description}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t.xQuantity}
          className="w-48"
          value={xq}
          onChange={(e) => {
            setXq(e.target.value);
            setXUnit(quantityOf(spec.x_quantities, e.target.value)?.reading_unit ?? "");
          }}
        >
          {spec.x_quantities.map((q) => (
            <SelectOption key={q.key} value={q.key}>
              {q.name}
            </SelectOption>
          ))}
        </Select>
        <Select label={t.xUnit} className="w-32" value={xUnit} onChange={(e) => setXUnit(e.target.value)}>
          {(xOption?.units ?? []).map((u) => (
            <SelectOption key={u.unit} value={u.unit}>
              {u.label}
            </SelectOption>
          ))}
        </Select>
        <Input label={t.xTitle} className="w-44" value={xLabel} onChange={(e) => setXLabel(e.target.value)} />
        <Select
          label={t.yQuantity}
          className="w-48"
          value={yq}
          onChange={(e) => {
            setYq(e.target.value);
            setYUnit(quantityOf(spec.y_quantities, e.target.value)?.reading_unit ?? "");
          }}
        >
          {spec.y_quantities.map((q) => (
            <SelectOption key={q.key} value={q.key}>
              {q.name}
            </SelectOption>
          ))}
        </Select>
        <Select label={t.yUnit} className="w-32" value={yUnit} onChange={(e) => setYUnit(e.target.value)}>
          {(yOption?.units ?? []).map((u) => (
            <SelectOption key={u.unit} value={u.unit}>
              {u.label}
            </SelectOption>
          ))}
        </Select>
        <Input label={t.yTitle} className="w-44" value={yLabel} onChange={(e) => setYLabel(e.target.value)} />
        <Select
          label={t.family}
          hint={t.familyHint}
          className="w-56"
          value={pq}
          onChange={(e) => setPq(e.target.value)}
        >
          <SelectOption value="">{t.noFamily}</SelectOption>
          {spec.parameter_quantities.map((q) => (
            <SelectOption key={q.key} value={q.key}>
              {q.name}
            </SelectOption>
          ))}
        </Select>
      </div>

      {series.map((s, i) => (
        <Card as="fieldset" key={s.key}>
          <legend className="sr-only">{t.seriesLabel(i + 1)}</legend>
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label={t.seriesName(i + 1)}
                className="w-48"
                value={s.label}
                onChange={(e) => updateSeries(s.key, { label: e.target.value })}
              />
              <Input
                label={t.conditions}
                className="w-56"
                value={s.conditions}
                onChange={(e) => updateSeries(s.key, { conditions: e.target.value })}
              />
              {pq && (
                <>
                  <Input
                    label={t.parameterValue(pOption?.name ?? "")}
                    className="w-28 tabular-nums"
                    inputMode="decimal"
                    value={s.parameter}
                    onChange={(e) => updateSeries(s.key, { parameter: e.target.value })}
                  />
                  <Select
                    label={t.parameterUnit}
                    className="w-28"
                    value={s.parameterUnit || (pOption?.reading_unit ?? "")}
                    onChange={(e) => updateSeries(s.key, { parameterUnit: e.target.value })}
                  >
                    {(pOption?.units ?? []).map((u) => (
                      <SelectOption key={u.unit} value={u.unit}>
                        {u.label}
                      </SelectOption>
                    ))}
                  </Select>
                </>
              )}
              {series.length > 1 && (
                <IconButton
                  className="ml-auto"
                  size="sm"
                  label={`${ptBR.actions.remove}: ${t.seriesLabel(i + 1)}`}
                  icon={<IconTrash />}
                  onClick={() => setSeries((cur) => cur.filter((x) => x.key !== s.key))}
                />
              )}
            </div>
            <Textarea
              label={t.points}
              hint={t.pointsHint}
              rows={6}
              className="font-mono"
              value={s.points}
              onChange={(e) => updateSeries(s.key, { points: e.target.value })}
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
            setSeries((cur) => [
              ...cur,
              { key: seriesKey++, label: "", conditions: "", parameter: "", parameterUnit: "", points: "" },
            ])
          }
        >
          {t.addSeries}
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
