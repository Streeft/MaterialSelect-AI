"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { SweepKind, SweepRequest, SweepResult, SweepSpacing } from "@/lib/types";
import { ApiError, listPerformanceIndices, sweepSynthesis } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  EmptyState,
  NumberInput,
  Select,
  SelectOption,
  StepCard,
} from "@/components/ui";
import { SweepChart } from "@/components/charts/SweepChart";

const t = ptBR.synthesis.sweep;

/** The message the reader sees for a failed sweep, in pt-BR (400/404/422). */
export function sweepErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // 400 and 404 carry a sentence written by the backend; show it as it came.
    if (error.status === 400) return `${t.error400}: ${error.message}`;
    if (error.status === 404) return t.error404;
    if (error.status === 422) return t.error422;
  }
  return t.errorGeneric;
}

/**
 * "Varrer" (D-144): the index of a family of recipes against one variable of
 * the material — the core/face ratio of a panel, the fibre fraction of a
 * composite. The parents and the kind are the ones already chosen in the
 * recipe above; the grid and the index are the only new choices. Nothing is
 * computed here: the request is validated for the reader's sake only, and the
 * numbers come from the API.
 */
export function SweepSection({
  kind,
  parentA,
  parentB,
}: {
  kind: string;
  parentA: string;
  parentB: string;
}) {
  const sweepKind: SweepKind | null = kind === "composito" || kind === "painel" ? kind : null;
  const indices = useQuery({ queryKey: ["performance-indices"], queryFn: listPerformanceIndices });

  const [indexId, setIndexId] = useState("");
  const [start, setStart] = useState("");
  const [stop, setStop] = useState("");
  const [steps, setSteps] = useState("9");
  const [spacing, setSpacing] = useState<SweepSpacing>("linear");
  // The result belongs to the parents it was computed for: change either and it
  // is no longer an answer to what the screen asks.
  const [answer, setAnswer] = useState<{ key: string; data: SweepResult } | null>(null);
  const parentsKey = `${parentA}|${parentB}`;
  const result = answer && answer.key === parentsKey ? answer.data : null;

  // Defaults per kind, derived (not written by effect): empty means "the default".
  const isPanel = sweepKind === "painel";
  const startValue = start || (isPanel ? "0.5" : "0.1");
  const stopValue = stop || (isPanel ? "30" : "0.9");
  const spacingValue: SweepSpacing = spacing;
  const list = indices.data ?? [];
  const chosen = list.find((item) => String(item.id) === (indexId || String(list[0]?.id ?? "")));

  const blocked = useMemo(() => {
    if (!parentA || !parentB || parentA === parentB) return t.blocked.parents;
    if (!chosen) return t.blocked.index;
    const a = Number(startValue);
    const b = Number(stopValue);
    if (!(a > 0 && b > a)) return t.blocked.range;
    if (!isPanel && !(b < 1)) return t.blocked.fraction;
    const n = Number(steps);
    if (!(Number.isInteger(n) && n >= 2 && n <= 50)) return t.blocked.steps;
    return null;
  }, [parentA, parentB, chosen, startValue, stopValue, steps, isPanel]);

  const run = useMutation({
    mutationFn: () =>
      sweepSynthesis({
        kind: sweepKind as SweepKind,
        parent_a_id: Number(parentA),
        parent_b_id: Number(parentB),
        start: Number(startValue),
        stop: Number(stopValue),
        steps: Number(steps),
        spacing: spacingValue,
        index: { name: chosen!.name, expression: chosen!.expression, goal: chosen!.goal },
      } satisfies SweepRequest),
    onSuccess: (data) => setAnswer({ key: parentsKey, data }),
  });

  if (sweepKind === null) {
    return (
      <StepCard title={t.title}>
        <p className="text-support text-ink-muted">{t.unavailable}</p>
      </StepCard>
    );
  }

  return (
    <StepCard
      title={t.title}
      description={t.description}
      bodyClassName="grid gap-4 sm:grid-cols-2"
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => run.mutate()}
            disabled={blocked !== null || run.isPending}
            aria-describedby={blocked ? "sintetizar-motivo-varrer" : undefined}
          >
            {run.isPending ? t.running : t.run}
          </Button>
          {blocked ? (
            <p id="sintetizar-motivo-varrer" className="text-support text-ink-muted">
              {blocked}
            </p>
          ) : null}
        </div>
      }
    >
      <div className="sm:col-span-2">
        {indices.isError ? (
          <Alert tone="danger">{t.indexError}</Alert>
        ) : indices.isLoading ? (
          <p className="text-support text-ink-muted">{t.indexLoading}</p>
        ) : list.length === 0 ? (
          <p className="text-support text-ink-muted">{t.indexEmpty}</p>
        ) : (
          <Select
            label={t.indexLabel}
            hint={chosen ? `${chosen.expression} — ${t.indexHint}` : t.indexHint}
            value={chosen ? String(chosen.id) : ""}
            onChange={(event) => {
              setIndexId((event.target as HTMLSelectElement).value);
              setAnswer(null);
            }}
          >
            {list.map((item) => (
              <SelectOption key={item.id} value={String(item.id)}>
                {item.name}
              </SelectOption>
            ))}
          </Select>
        )}
      </div>
      <p className="text-support text-ink-muted sm:col-span-2">
        {isPanel ? t.variablePanel : t.variableComposite}
      </p>
      <NumberInput
        label={t.startLabel}
        value={startValue}
        min={0}
        step="any"
        onChange={(event) => setStart(event.target.value)}
      />
      <NumberInput
        label={t.stopLabel}
        value={stopValue}
        min={0}
        step="any"
        onChange={(event) => setStop(event.target.value)}
      />
      <NumberInput
        label={t.stepsLabel}
        hint={t.stepsHint}
        value={steps}
        min={2}
        max={50}
        step={1}
        onChange={(event) => setSteps(event.target.value)}
      />
      <Select
        label={t.spacingLabel}
        value={spacingValue}
        onChange={(event) => setSpacing((event.target as HTMLSelectElement).value as SweepSpacing)}
      >
        <SelectOption value="linear">{t.spacingLinear}</SelectOption>
        <SelectOption value="log">{t.spacingLog}</SelectOption>
      </Select>

      <div className="flex flex-col gap-4 sm:col-span-2" aria-live="polite">
        {run.isError ? (
          <Alert tone="danger" title={t.errorTitle}>
            {sweepErrorMessage(run.error)}
          </Alert>
        ) : null}
        {result ? (
          <>
            <p className="text-support text-ink-muted">
              {t.parents}: {result.parents.join(" · ")}
            </p>
            <SweepChart data={result} />
          </>
        ) : run.isError || run.isPending ? null : (
          <EmptyState title={t.idleTitle} description={t.idleHint} />
        )}
      </div>
    </StepCard>
  );
}
