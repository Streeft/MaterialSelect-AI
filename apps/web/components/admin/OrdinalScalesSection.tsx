"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrdinalScale, listOrdinalProperties, updateOrdinalScale } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import type { OrdinalProperty, OrdinalScale, OrdinalScaleUpdate } from "@/lib/types";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  ErrorState,
  Input,
  LoadingState,
  Textarea,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";

const t = curadoriaText.ordinalScale;
const MAX_LEVELS = 12;
const NAME_MAX = 160;
const DESCRIPTION_MAX = 500;

/**
 * Admin › Propriedades: the ordinal properties and their scales, editable by hand
 * (D-251, ORD-c). A scale is an order that materials, saved studies and the project's
 * scenarios all point into, so the dialog shows what depends on each level and
 * switches off the edits the server would refuse; the server is still the one that
 * decides, and says why.
 */
export function OrdinalScalesSection() {
  const scales = useQuery({
    queryKey: ["ordinal-properties"],
    queryFn: listOrdinalProperties,
  });
  const [editing, setEditing] = useState<OrdinalProperty | null>(null);

  return (
    <section aria-labelledby="ordinal-scales-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="ordinal-scales-title" className="text-title text-ink">
          {t.title}
        </h2>
        <p className="max-w-prose text-support text-ink-muted">{t.hint}</p>
      </div>
      {scales.isLoading ? <LoadingState label={t.loading} /> : null}
      {scales.isError ? (
        <ErrorState title={t.error} error={scales.error} onRetry={() => void scales.refetch()} />
      ) : null}
      {scales.data && scales.data.length === 0 ? (
        <p className="text-body text-ink-muted">{t.empty}</p>
      ) : null}
      {scales.data && scales.data.length > 0 ? (
        <TableScroll label={t.title}>
          <Table>
            <TableCaption>{t.title}</TableCaption>
            <THead>
              <Tr>
                <Th>{t.name}</Th>
                <Th>{t.scaleColumn}</Th>
                <Th>
                  <span className="sr-only">{ptBR.actions.columnActions}</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {scales.data.map((scale) => (
                <Tr key={scale.slug}>
                  <Td className="font-medium">
                    {scale.name}{" "}
                    {scale.is_demo ? <Badge tone="neutral">{t.demo}</Badge> : null}
                  </Td>
                  <Td className="text-ink-muted">{scale.scale_text}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t.actionFor(scale.name)}
                      onClick={() => setEditing(scale)}
                    >
                      {t.action}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      ) : null}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? t.dialogTitle(editing.name) : t.action}
        description={t.dialogDescription}
      >
        {editing ? (
          <ScaleLoader key={editing.slug} slug={editing.slug} onClose={() => setEditing(null)} />
        ) : null}
      </Dialog>
    </section>
  );
}

function ScaleLoader({ slug, onClose }: { slug: string; onClose: () => void }) {
  const scale = useQuery({
    queryKey: ["ordinal-scale", slug],
    queryFn: () => getOrdinalScale(slug),
    // The dependants are counted on the server each time: an old count would offer an edit it will refuse.
    staleTime: 0,
  });
  if (scale.isLoading) return <LoadingState label={t.loading} />;
  if (scale.isError || !scale.data)
    return <ErrorState title={t.error} error={scale.error} onRetry={() => void scale.refetch()} />;
  return <ScaleForm scale={scale.data} onClose={onClose} />;
}

interface Row {
  key: string;
  id?: number;
  label: string;
  originalLabel: string;
  held: number;
  studies: number;
  scenarios: number;
}

function ScaleForm({ scale, onClose }: { scale: OrdinalScale; onClose: () => void }) {
  const client = useQueryClient();
  const snackbar = useOptionalSnackbar();
  const [name, setName] = useState(scale.name);
  const [description, setDescription] = useState(scale.description ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    scale.levels.map((level) => ({
      key: `n${level.id}`,
      id: level.id,
      label: level.label,
      originalLabel: level.label,
      held: level.value_count,
      studies: level.study_count,
      scenarios: level.scenario_count,
    })),
  );
  const [counter, setCounter] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // The order of the existing levels is frozen while anything asks for one of them.
  const orderLocked = scale.levels.some((l) => l.study_count > 0 || l.scenario_count > 0);

  const problem = useMemo(() => {
    if (!name.trim()) return t.blank;
    if (rows.length < 2) return t.minLevels;
    if (rows.some((row) => !row.label.trim())) return t.blank;
    const folded = rows.map((row) => row.label.trim().toLocaleLowerCase("pt-BR"));
    if (new Set(folded).size !== folded.length) return t.duplicate;
    return null;
  }, [name, rows]);

  const dirty =
    name.trim() !== scale.name ||
    description.trim() !== (scale.description ?? "") ||
    rows.length !== scale.levels.length ||
    rows.some(
      (row, index) => row.id !== scale.levels[index]?.id || row.label.trim() !== row.originalLabel,
    );

  const save = useMutation({
    mutationFn: () => {
      const body: OrdinalScaleUpdate = {
        levels: rows.map((row) =>
          row.id === undefined ? { label: row.label.trim() } : { id: row.id, label: row.label.trim() },
        ),
        // Only what changed: a field left out is left alone by the server.
        ...(name.trim() !== scale.name ? { name: name.trim() } : {}),
        ...(description.trim() !== (scale.description ?? "")
          ? { description: description.trim() || null }
          : {}),
      };
      return updateOrdinalScale(scale.slug, body);
    },
    onSuccess: (updated) => {
      void client.invalidateQueries({ queryKey: ["ordinal-properties"] });
      void client.invalidateQueries({ queryKey: ["ordinal-scale", scale.slug] });
      snackbar?.notify({ message: t.saved(updated.name) });
      onClose();
    },
  });

  const move = (index: number, by: -1 | 1) =>
    setRows((list) => {
      const target = index + by;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (problem || !dirty) return;
        save.mutate();
      }}
    >
      <Input
        label={t.name}
        value={name}
        maxLength={NAME_MAX}
        required
        onChange={(event) => setName(event.target.value)}
      />
      <Textarea
        label={t.description}
        rows={2}
        maxLength={DESCRIPTION_MAX}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-body font-medium text-ink">{t.levels}</legend>
        {orderLocked ? (
          <Alert tone="info" role="status">
            {t.lockedOrder}
          </Alert>
        ) : null}
        <ol className="flex flex-col gap-3">
          {rows.map((row, index) => {
            const asked = row.studies > 0 || row.scenarios > 0;
            const inUse = row.held > 0 || asked;
            const reasons = [
              row.held > 0 ? t.held(row.held) : null,
              asked ? t.asked(row.studies, row.scenarios) : null,
            ].filter(Boolean);
            const existing = row.id !== undefined;
            return (
              <li key={row.key} className="well flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-end gap-2">
                  <Input
                    label={t.levelLabel(index + 1)}
                    className="min-w-0 flex-1"
                    value={row.label}
                    maxLength={80}
                    disabled={existing && asked}
                    hint={existing && asked ? t.lockedRename : undefined}
                    onChange={(event) =>
                      setRows((list) =>
                        list.map((r, i) => (i === index ? { ...r, label: event.target.value } : r)),
                      )
                    }
                  />
                  <div className="flex flex-wrap gap-1 pb-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === 0 || (orderLocked && existing)}
                      aria-label={t.moveUp(row.label || t.levelLabel(index + 1))}
                      onClick={() => move(index, -1)}
                    >
                      {t.up}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === rows.length - 1 || (orderLocked && existing)}
                      aria-label={t.moveDown(row.label || t.levelLabel(index + 1))}
                      onClick={() => move(index, 1)}
                    >
                      {t.down}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={existing && inUse}
                      aria-label={t.remove(row.label || t.levelLabel(index + 1))}
                      onClick={() => setRows((list) => list.filter((_, i) => i !== index))}
                    >
                      {t.removeShort}
                    </Button>
                  </div>
                </div>
                {reasons.length > 0 ? (
                  <p className="text-support text-ink-muted">
                    {reasons.join("; ")}. {t.lockedRemove}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            size="sm"
            variant="secondary"
            disabled={rows.length >= MAX_LEVELS}
            onClick={() => {
              setRows((list) => [
                ...list,
                {
                  key: `new${counter}`,
                  label: "",
                  originalLabel: "",
                  held: 0,
                  studies: 0,
                  scenarios: 0,
                },
              ]);
              setCounter((n) => n + 1);
            }}
          >
            {t.add}
          </Button>
          {rows.length >= MAX_LEVELS ? (
            <span className="ml-2 text-support text-ink-muted">{t.maxLevels(MAX_LEVELS)}</span>
          ) : null}
        </div>
      </fieldset>
      {submitted && problem ? (
        <Alert tone="warning" role="alert">
          {problem}
        </Alert>
      ) : null}
      {save.error ? (
        <Alert tone="danger" role="alert">
          {describeApiError(save.error, t.failed)}
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {ptBR.actions.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
