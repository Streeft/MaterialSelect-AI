"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Badge, ConfirmDialog, Disclosure } from "@/components/ui";
import { PlanComponentCard } from "@/components/ai/PlanComponentCard";
import { confirmationRequest, withRerun } from "@/lib/ai/plan";
import { runPlan } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { planText } from "@/lib/i18n-plan";
import type { PlanComponent, ProjectPlan } from "@/lib/types";

const t = planText;

/**
 * The proposal of the project assistant (D-225), used by the home and by the
 * selection wizard: what was understood, the premises and open questions, the
 * scenarios behind the numbers, and one card per part.
 *
 * The plan lives with the caller (`plan`/`onPlanChange`): confirming an AI
 * suggestion asks `POST /ai/plan/run` to run the parts again — no model, no
 * quota — and hands the new plan back. What each screen does with a part (open
 * it in the wizard, apply it to the study) is `renderActions`.
 */
export function PlanView({
  plan,
  onPlanChange,
  renderActions,
  headingLevel = 2,
  extra,
}: {
  plan: ProjectPlan;
  onPlanChange: (plan: ProjectPlan) => void;
  renderActions?: (component: PlanComponent, busy: boolean) => ReactNode;
  /** The proposal's own heading level; the parts are one level below. */
  headingLevel?: 2 | 3;
  /** Controls of the whole proposal, e.g. "Ajustar o pedido". */
  extra?: ReactNode;
}) {
  const [pending, setPending] = useState<{
    componentKey: string;
    index: number;
    label: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rerun = useMutation({
    mutationFn: (request: ReturnType<typeof confirmationRequest>) => runPlan(request),
    onSuccess: (response) => {
      setError(null);
      onPlanChange(withRerun(plan, response.components));
    },
    onError: (err) => setError(describeApiError(err, t.suggestionRerunError)),
    onSettled: () => setPending(null),
  });

  const scenarioNames = Object.fromEntries(plan.scenarios_used.map((s) => [s.id, s.name]));
  const Heading = `h${headingLevel}` as "h2" | "h3";
  const SubHeading = `h${headingLevel + 1}` as "h3" | "h4";
  const partLevel = (headingLevel + 1) as 3 | 4;

  function toggle(component: PlanComponent, index: number, confirmed: boolean) {
    const constraint = component.constraints[index];
    if (!constraint) return;
    if (confirmed) {
      // Marking an AI suggestion is a decision, so it asks first (D-224).
      setPending({ componentKey: component.key, index, label: constraint.label });
      return;
    }
    rerun.mutate(confirmationRequest(plan, component.key, index, false));
  }

  return (
    <div className="min-w-0 space-y-4">
      {plan.degraded && (
        <Alert tone="warning" title={t.degradedTitle} role="status">
          {plan.notice ?? t.degradedDefault}
        </Alert>
      )}

      <section className="min-w-0 space-y-2 break-words">
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="text-title text-ink">{t.proposalTitle}</Heading>
          {plan.simulated && <Badge tone="info">{t.simulated}</Badge>}
          {extra}
        </div>
        {plan.summary && <p className="max-w-prose text-body text-ink">{plan.summary}</p>}
        {plan.cached && <p className="text-support text-ink-subtle">{t.cached}</p>}
      </section>

      {plan.assumptions.length > 0 && (
        <section className="min-w-0 space-y-1 break-words">
          <SubHeading className="text-caption font-semibold text-ink-subtle">
            {t.assumptionsTitle}
          </SubHeading>
          <ul className="space-y-1 text-body text-ink-muted">
            {plan.assumptions.map((item, i) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </section>
      )}

      {plan.open_questions.length > 0 && (
        <Alert tone="info" title={t.questionsTitle}>
          <p>{t.questionsHint}</p>
          <ul className="mt-1 space-y-1">
            {plan.open_questions.map((question, i) => (
              <li key={i}>• {question}</li>
            ))}
          </ul>
        </Alert>
      )}

      {plan.scenarios_used.length > 0 && (
        <section className="min-w-0 space-y-1 break-words">
          <SubHeading className="text-caption font-semibold text-ink-subtle">
            {t.scenariosTitle}
          </SubHeading>
          <ul className="space-y-1 text-body text-ink-muted">
            {plan.scenarios_used.map((scenario) => (
              <li key={scenario.id}>
                <strong className="font-medium text-ink">{scenario.name}</strong>
                {scenario.source ? ` — ${t.scenarioSource(scenario.source)}` : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <p role="status" className="sr-only">
        {rerun.isPending ? t.suggestionRerunning : ""}
      </p>

      <div className="min-w-0 space-y-3">
        <ul className="space-y-3">
          {plan.components.map((component) => (
            <li key={component.key} className="min-w-0">
              <PlanComponentCard
                component={component}
                scenarioNames={scenarioNames}
                busy={rerun.isPending}
                headingLevel={partLevel}
                onToggleSuggestion={(index, confirmed) => toggle(component, index, confirmed)}
                actions={renderActions?.(component, rerun.isPending)}
              />
            </li>
          ))}
        </ul>
      </div>

      {plan.rejected.length > 0 && (
        <Disclosure summary={t.rejectedTitle(plan.rejected.length)}>
          <p className="text-caption text-ink-muted">{t.rejectedHint}</p>
          <ul className="mt-1 space-y-1 text-caption text-ink-muted">
            {plan.rejected.map((reason, i) => (
              <li key={i}>• {reason}</li>
            ))}
          </ul>
        </Disclosure>
      )}

      {plan.disclaimer && <p className="text-support text-ink-subtle">{plan.disclaimer}</p>}

      <ConfirmDialog
        open={pending !== null}
        title={t.suggestionConfirmTitle}
        message={pending ? t.suggestionConfirmMessage(pending.label) : undefined}
        confirmLabel={t.suggestionConfirm}
        pending={rerun.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            rerun.mutate(confirmationRequest(plan, pending.componentKey, pending.index, true));
          }
        }}
      />
    </div>
  );
}
