"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAIStatus, planProject } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import { planText } from "@/lib/i18n-plan";
import { PLAN_DEBOUNCE_MS, PLAN_MAX_CHARS, isInterpretable } from "@/lib/ai/plan";
import type { PlanComponent, ProjectPlan } from "@/lib/types";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Textarea } from "@/components/ui";
import { PlanView } from "@/components/ai/PlanView";

const t = planText;

interface AIAssistPanelProps {
  /**
   * Called with the one part the person chose to apply. Nothing reaches the
   * wizard before this click; an AI suggestion is in the part only if the
   * person confirmed it (its `study` carries the applied limits only).
   */
  onApply: (component: PlanComponent) => void;
}

/**
 * The project assistant for the first step of the selection wizard (D-225),
 * for one part (`mode: "single"`).
 *
 * It interprets while the person types — a pause of about a second and a half,
 * from 15 characters on, the earlier call cancelled when a new one starts — and
 * the "Interpretar" button asks at once. The answer is a review surface, not an
 * action: function, objective, index and limits, each number with its origin,
 * and the best materials the server found. Only "Aplicar ao estudo" changes the
 * study, and an AI suggestion goes in only if it was ticked and confirmed.
 */
export function AIAssistPanel({ onApply }: AIAssistPanelProps) {
  const [statement, setStatement] = useState("");
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  /** The text the proposal on screen answered. */
  const [asked, setAsked] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const status = useQuery({ queryKey: ["ai-status"], queryFn: getAIStatus });
  const controller = useRef<AbortController | null>(null);

  const interpret = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // One call at a time: a new text cancels the one still on its way.
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    setInterpreting(true);
    setError(null);
    try {
      const result = await planProject({ text: trimmed, mode: "single" }, mine.signal);
      if (controller.current !== mine) return;
      setPlan(result);
      setAsked(trimmed);
      setApplied(false);
    } catch (err) {
      if (mine.signal.aborted || controller.current !== mine) return;
      setError(describeApiError(err, t.errorTitle));
    } finally {
      if (controller.current === mine) {
        controller.current = null;
        setInterpreting(false);
      }
    }
  }, []);

  // Interpret while typing: debounced, never on a short text, never twice for
  // the same text. The timer is the cancellation of "the person is still typing".
  const enabled = status.data ? status.data.enabled : true;
  useEffect(() => {
    const trimmed = statement.trim();
    if (!enabled || !isInterpretable(trimmed) || trimmed === asked) return;
    const timer = window.setTimeout(() => void interpret(trimmed), PLAN_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [statement, asked, enabled, interpret]);

  useEffect(() => () => controller.current?.abort(), []);

  if (status.data && !status.data.enabled) {
    return (
      <Card>
        <CardHeader title={ptBR.ai.title} headingLevel={2} description={t.panelOff} />
      </Card>
    );
  }

  const trimmed = statement.trim();
  // The text moved on since the proposal: applying it would apply an answer to
  // another question.
  const stale = plan !== null && asked !== trimmed;
  const component = plan?.components[0] ?? null;

  return (
    <Card className="border-info/40">
      <CardHeader
        title={t.panelTitle}
        headingLevel={2}
        description={t.panelSubtitle}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="info">{t.badges.optional}</Badge>
            <Badge tone="info">{t.badges.review}</Badge>
          </div>
        }
      />
      <CardBody className="min-w-0 space-y-3">
        <Textarea
          label={t.statementLabel}
          hint={t.statementHint(15)}
          rows={3}
          maxLength={PLAN_MAX_CHARS}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder={t.statementPlaceholder}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={!trimmed}
            loading={interpreting}
            onClick={() => void interpret(statement)}
          >
            {t.interpret}
          </Button>
          <span role="status" aria-live="polite" className="text-caption text-ink-muted">
            {interpreting ? t.interpreting : ""}
          </span>
        </div>

        {error && (
          <Alert tone="danger" role="alert" title={t.errorTitle}>
            <p>{error}</p>
            <div className="mt-2">
              <Button size="sm" variant="secondary" onClick={() => void interpret(statement)}>
                {t.retry}
              </Button>
            </div>
          </Alert>
        )}

        {plan && component && (
          <PlanView
            plan={plan}
            headingLevel={3}
            onPlanChange={(next) => {
              setPlan(next);
              setApplied(false);
            }}
            renderActions={(part, busy) => (
              <>
                <Button
                  variant="secondary"
                  disabled={busy || stale || interpreting}
                  onClick={() => {
                    onApply(part);
                    setApplied(true);
                  }}
                >
                  {t.apply}
                </Button>
                {stale ? (
                  <span className="text-caption text-ink-muted">{t.stale}</span>
                ) : applied ? (
                  <span role="status" className="text-body text-success-fg">
                    {t.applied}
                  </span>
                ) : (
                  <span className="text-caption text-ink-muted">{t.applyHint}</span>
                )}
              </>
            )}
          />
        )}
      </CardBody>
    </Card>
  );
}
