"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  Disclosure,
  NumberInput,
} from "@/components/ui";
import { ConstraintOriginChip } from "@/components/ai/ConstraintOriginChip";
import {
  EDIT_NOTE_PREFIX,
  type LimitEdit,
  isEditable,
  isSuggestion,
  isValidEdit,
  materialHref,
  originKind,
  scenarioId,
} from "@/lib/ai/plan";
import { planText } from "@/lib/i18n-plan";
import type { PlanComponent, PlanConstraint } from "@/lib/types";

const t = planText;

/**
 * One part of the proposal (D-225): what it must do, what it is ranked by, the
 * limits with where each number came from, and the best materials the server
 * found — each with the reason the server gave. Every material and every
 * figure here was computed by the backend; the card draws them.
 *
 * An AI suggestion is a checkbox that starts unchecked: the person's tick (and
 * the confirmation it asks for) is what makes it count.
 */
export function PlanComponentCard({
  component,
  scenarioNames,
  busy,
  headingLevel = 3,
  onToggleSuggestion,
  onEditLimit,
  actions,
}: {
  component: PlanComponent;
  /** Scenario id → name, from the plan's `scenarios_used`. */
  scenarioNames: Record<string, string>;
  /** A re-run is on its way: the suggestion boxes wait for it. */
  busy: boolean;
  headingLevel?: 3 | 4;
  onToggleSuggestion: (constraintIndex: number, confirmed: boolean) => void;
  /** The person typed over a limit's number (D-251); without it the limits are read-only. */
  onEditLimit?: (constraintIndex: number, edit: LimitEdit) => void;
  actions?: ReactNode;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const headingId = useId();
  const run = component.result;
  const materials = run?.materials ?? [];
  const index = component.index;
  return (
    <Card as="article" aria-labelledby={headingId} className="min-w-0">
      <CardHeader
        title={<span id={headingId}>{component.name}</span>}
        description={component.role || undefined}
        headingLevel={headingLevel}
      />
      <CardBody className="min-w-0 space-y-4 break-words">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)]">
          {component.function_text && (
            <>
              <dt className="text-caption font-semibold text-ink-subtle">{t.function}</dt>
              <dd className="min-w-0 text-body text-ink">{component.function_text}</dd>
            </>
          )}
          {component.objective_text && (
            <>
              <dt className="text-caption font-semibold text-ink-subtle">{t.objective}</dt>
              <dd className="min-w-0 text-body text-ink">{component.objective_text}</dd>
            </>
          )}
          {index ? (
            <>
              <dt className="text-caption font-semibold text-ink-subtle">{t.index}</dt>
              <dd className="min-w-0 text-body text-ink">
                <strong className="font-medium">{index.name}</strong>{" "}
                <code className="break-all text-caption text-ink-muted">{index.expression}</code>
              </dd>
            </>
          ) : component.criteria.length > 0 ? (
            <>
              <dt className="text-caption font-semibold text-ink-subtle">{t.ranking}</dt>
              <dd className="min-w-0 text-body text-ink">
                <ul className="space-y-0.5">
                  {component.criteria.map((criterion) => (
                    <li key={criterion.property}>
                      {criterion.direction === "max"
                        ? t.rankingMax(criterion.property_name)
                        : t.rankingMin(criterion.property_name)}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}
        </dl>

        <div className="space-y-2">
          <h4 className="text-caption font-semibold text-ink-subtle">{t.limits}</h4>
          {component.constraints.length === 0 ? (
            <p className="text-caption text-ink-muted">{t.noLimits}</p>
          ) : (
            <ul className="space-y-2">
              {component.constraints.map((constraint, i) => {
                const kind = originKind(constraint.origin);
                const id = scenarioId(constraint.origin);
                const chip = (
                  <ConstraintOriginChip
                    origin={constraint.origin}
                    scenarioName={id ? scenarioNames[id] : null}
                    source={constraint.source}
                  />
                );
                return (
                  <li key={`${constraint.property}-${i}`} className="flex min-w-0 flex-col gap-1">
                    {isSuggestion(constraint) ? (
                      <Checkbox
                        checked={constraint.applied}
                        disabled={busy}
                        onChange={(e) => onToggleSuggestion(i, e.target.checked)}
                        label={
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="min-w-0">{constraint.label}</span>
                            {chip}
                          </span>
                        }
                        hint={constraint.applied ? t.suggestionApplied : t.suggestionNotApplied}
                      />
                    ) : (
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 text-body text-ink">{constraint.label}</span>
                        {chip}
                      </div>
                    )}
                    {onEditLimit && isEditable(constraint) ? (
                      editing === i ? (
                        <LimitEditor
                          constraint={constraint}
                          busy={busy}
                          onCancel={() => setEditing(null)}
                          onApply={(edit) => {
                            setEditing(null);
                            onEditLimit(i, edit);
                          }}
                        />
                      ) : (
                        <div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            aria-label={t.editLimitNamed(constraint.property_name)}
                            onClick={() => setEditing(i)}
                          >
                            {t.editLimit}
                          </Button>
                        </div>
                      )
                    ) : null}
                    {kind === "usuario" && constraint.note.startsWith(EDIT_NOTE_PREFIX) ? (
                      <p className="text-support text-ink-subtle">{constraint.note}</p>
                    ) : null}
                    {kind !== "usuario" && kind !== "indice" && constraint.source ? (
                      <p className="text-support text-ink-subtle">{t.limitSource(constraint.source)}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {component.rejected.length > 0 && (
          <Disclosure summary={t.rejectedTitle(component.rejected.length)} flush>
            <p className="text-caption text-ink-muted">{t.rejectedHint}</p>
            <ul className="mt-1 space-y-1 text-caption text-ink-muted">
              {component.rejected.map((reason, i) => (
                <li key={i}>• {reason}</li>
              ))}
            </ul>
          </Disclosure>
        )}

        <div className="space-y-2">
          <h4 className="text-caption font-semibold text-ink-subtle">{t.materials}</h4>
          {run?.error ? (
            <Alert tone="warning" title={t.runError}>
              {run.error}
            </Alert>
          ) : materials.length > 0 ? (
            <>
              <ol className="space-y-2">
                {materials.map((material, position) => (
                  <li key={material.record_id} className="flex min-w-0 gap-2">
                    <span aria-hidden className="w-6 shrink-0 text-caption text-ink-subtle">
                      {t.materialRank(material.rank ?? position + 1)}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={materialHref(material.record_id)}
                        className="text-body font-medium text-brand-700 underline-offset-2 hover:underline"
                      >
                        {material.name}
                      </Link>{" "}
                      <span className="text-caption text-ink-muted">{material.class_name}</span>
                      {material.reason && (
                        <p className="text-caption text-ink-muted">{material.reason}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {run && (
                <p className="text-support text-ink-subtle">
                  {t.funnel(run.final_count, run.initial_count)}
                </p>
              )}
            </>
          ) : (
            <Alert tone="info" title={t.noMaterials}>
              {run?.message ?? t.noMaterialsHint}
            </Alert>
          )}
        </div>
      </CardBody>
      {actions ? <CardFooter className="!justify-start">{actions}</CardFooter> : null}
    </Card>
  );
}

/**
 * The inline editor of one limit (D-251): the number(s) of the operator, in the
 * limit's own unit, and the two ways out. The number is typed, never proposed; the
 * server re-runs the selection with it and keeps the note of where it was.
 */
function LimitEditor({
  constraint,
  busy,
  onApply,
  onCancel,
}: {
  constraint: PlanConstraint;
  busy: boolean;
  onApply: (edit: LimitEdit) => void;
  onCancel: () => void;
}) {
  const range = constraint.operator === "between";
  const start = (value: number | null) => (value === null ? "" : String(value));
  const [value, setValue] = useState(start(constraint.value));
  const [low, setLow] = useState(start(constraint.value_min));
  const [high, setHigh] = useState(start(constraint.value_max));
  const [invalid, setInvalid] = useState(false);
  const unit = constraint.unit ?? undefined;
  const name = constraint.property_name;

  function submit() {
    const read = (raw: string) => (raw.trim() === "" ? undefined : Number(raw));
    const edit: LimitEdit = range
      ? { value_min: read(low), value_max: read(high) }
      : { value: read(value) };
    if (!isValidEdit(constraint, edit)) {
      setInvalid(true);
      return;
    }
    onApply(edit);
  }

  return (
    <div className="well flex min-w-0 flex-col gap-3">
      <p className="text-support text-ink-muted">{t.editHint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {range ? (
          <>
            <NumberInput
              label={t.editMin(name)}
              unit={unit}
              step="any"
              value={low}
              onChange={(e) => setLow(e.target.value)}
            />
            <NumberInput
              label={t.editMax(name)}
              unit={unit}
              step="any"
              value={high}
              onChange={(e) => setHigh(e.target.value)}
            />
          </>
        ) : (
          <NumberInput
            label={t.editValue(name)}
            unit={unit}
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </div>
      {invalid ? (
        <Alert tone="warning" role="alert">
          {t.editInvalid}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={submit}>
          {t.editApply}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t.editCancel}
        </Button>
      </div>
    </div>
  );
}
