"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError, getAIStatus, interpretStatement } from "@/lib/api";
import type { Interpretation, SuggestedConstraint, SuggestedIndex } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  RadioOption,
  Textarea,
} from "@/components/ui";

const t = ptBR.ai;

export interface AcceptedSuggestions {
  functionText: string | null;
  objectiveText: string | null;
  freeVariables: string[];
  constraints: SuggestedConstraint[];
  index: SuggestedIndex | null;
}

interface AIAssistPanelProps {
  /** Called with only the items the user ticked. Nothing is applied before this. */
  onApply: (accepted: AcceptedSuggestions) => void;
}

/**
 * Optional assistant for the first step of the selection wizard.
 *
 * The panel is a review surface, not an action: the API returns proposals, the
 * user chooses which to keep, and only then does anything reach the wizard. The
 * suggestions the backend's guardrails refused are shown too — seeing what was
 * rejected, and why, is part of trusting what was not.
 *
 * Both of those properties are now stated on the panel itself. §3.4 of the
 * proposal commits to assistance that is optional and reviewable, and a
 * commitment that only exists in the document is one the reader never sees.
 */
export function AIAssistPanel({ onApply }: AIAssistPanelProps) {
  const [statement, setStatement] = useState("");
  const [proposal, setProposal] = useState<Interpretation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const [useFunction, setUseFunction] = useState(true);
  const [useObjective, setUseObjective] = useState(true);
  const [useFreeVariables, setUseFreeVariables] = useState(true);
  const [acceptedConstraints, setAcceptedConstraints] = useState<Set<number>>(new Set());
  const [acceptedIndex, setAcceptedIndex] = useState<string | null>(null);

  const status = useQuery({ queryKey: ["ai-status"], queryFn: getAIStatus });

  const interpret = useMutation({
    mutationFn: () => interpretStatement(statement.trim()),
    onSuccess: (data) => {
      setProposal(data);
      setError(null);
      setApplied(false);
      // Pre-tick everything that survived the guardrails; the user unticks.
      setUseFunction(Boolean(data.function_text));
      setUseObjective(Boolean(data.objective_text));
      setUseFreeVariables(data.free_variables.length > 0);
      setAcceptedConstraints(new Set(data.constraints.map((_, i) => i)));
      setAcceptedIndex(data.indices[0]?.slug ?? null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : t.error),
  });

  const selectedCount = useMemo(
    () =>
      acceptedConstraints.size +
      (useFunction ? 1 : 0) +
      (useObjective ? 1 : 0) +
      (useFreeVariables ? 1 : 0) +
      (acceptedIndex ? 1 : 0),
    [acceptedConstraints, useFunction, useObjective, useFreeVariables, acceptedIndex],
  );

  if (status.data && !status.data.enabled) {
    return (
      <Card>
        <CardHeader title={t.title} headingLevel={2} description={t.disabled} />
      </Card>
    );
  }

  function toggleConstraint(index: number) {
    setAcceptedConstraints((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function apply() {
    if (!proposal) return;
    onApply({
      functionText: useFunction ? proposal.function_text : null,
      objectiveText: useObjective ? proposal.objective_text : null,
      freeVariables: useFreeVariables ? proposal.free_variables : [],
      constraints: proposal.constraints.filter((_, i) => acceptedConstraints.has(i)),
      index: proposal.indices.find((i) => i.slug === acceptedIndex) ?? null,
    });
    setApplied(true);
  }

  return (
    <Card className="border-info/40">
      <CardHeader
        title={t.title}
        headingLevel={2}
        description={t.subtitle}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="info">{t.optionalBadge}</Badge>
            <Badge tone="info">{t.reviewBadge}</Badge>
            {status.data?.simulated && <Badge tone="warning">{t.simulatedBadge}</Badge>}
          </div>
        }
      />
      <CardBody className="space-y-3">
        <Field label={t.statementLabel}>
          <Textarea
            rows={3}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder={t.statementPlaceholder}
          />
        </Field>

        <Button
          variant="primary"
          disabled={!statement.trim()}
          loading={interpret.isPending}
          onClick={() => interpret.mutate()}
        >
          {interpret.isPending ? t.interpreting : t.interpret}
        </Button>

        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}

        {proposal && (
          <Card>
            <CardHeader title={t.proposalTitle} />
            <CardBody className="space-y-3">
              <ul className="space-y-1.5">
                {proposal.function_text && (
                  <li>
                    <Checkbox
                      checked={useFunction}
                      onChange={(e) => setUseFunction(e.target.checked)}
                      label={
                        <>
                          <strong className="text-ink-muted">{t.functionRead}:</strong>{" "}
                          {proposal.function_text}
                        </>
                      }
                    />
                  </li>
                )}
                {proposal.objective_text && (
                  <li>
                    <Checkbox
                      checked={useObjective}
                      onChange={(e) => setUseObjective(e.target.checked)}
                      label={
                        <>
                          <strong className="text-ink-muted">{t.objectiveRead}:</strong>{" "}
                          {proposal.objective_text}
                        </>
                      }
                    />
                  </li>
                )}
                {proposal.free_variables.length > 0 && (
                  <li>
                    <Checkbox
                      checked={useFreeVariables}
                      onChange={(e) => setUseFreeVariables(e.target.checked)}
                      label={
                        <>
                          <strong className="text-ink-muted">{t.freeVariablesRead}:</strong>{" "}
                          {proposal.free_variables.join(", ")}
                        </>
                      }
                    />
                  </li>
                )}
              </ul>

              {proposal.constraints.length > 0 && (
                <div>
                  <h4 className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                    {t.constraintsRead}
                  </h4>
                  <ul className="mt-1 space-y-1.5">
                    {proposal.constraints.map((suggestion, i) => (
                      <li key={i}>
                        <Checkbox
                          checked={acceptedConstraints.has(i)}
                          onChange={() => toggleConstraint(i)}
                          label={suggestion.rationale}
                          hint={`${t.evidence}: “${suggestion.evidence}”`}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {proposal.indices.length > 0 && (
                <fieldset>
                  <legend className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                    {t.indicesRead}
                  </legend>
                  <ul className="mt-1 space-y-1.5">
                    {proposal.indices.map((suggestion) => (
                      <li key={suggestion.slug} className="flex flex-col">
                        <RadioOption
                          name="ai-index"
                          checked={acceptedIndex === suggestion.slug}
                          onChange={() => setAcceptedIndex(suggestion.slug)}
                          label={
                            <>
                              <strong>{suggestion.name}</strong>{" "}
                              <code className="text-xs text-ink-muted">
                                {suggestion.expression}
                              </code>
                            </>
                          }
                        />
                        <span className="ml-6 text-2xs text-ink-subtle">
                          {suggestion.rationale}
                        </span>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}

              {proposal.chart && (
                <p className="text-xs text-ink-muted">
                  <strong className="uppercase tracking-wide">{t.chartRead}:</strong>{" "}
                  {proposal.chart.y} × {proposal.chart.x} ({proposal.chart.scale}) —{" "}
                  {proposal.chart.rationale}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-edge-subtle pt-3">
                <Button variant="primary" onClick={apply} disabled={selectedCount === 0}>
                  {t.apply}
                </Button>
                {selectedCount === 0 && (
                  <span className="text-xs text-ink-muted">{t.nothingToApply}</span>
                )}
                {applied && <span className="text-sm text-success-fg">{t.applied}</span>}
              </div>

              {proposal.open_questions.length > 0 && (
                <Alert tone="warning" title={t.openQuestions}>
                  <ul className="space-y-1">
                    {proposal.open_questions.map((question, i) => (
                      <li key={i}>• {question}</li>
                    ))}
                  </ul>
                </Alert>
              )}

              {proposal.rejected.length > 0 && (
                <Alert tone="info" title={t.rejected}>
                  <p>{t.rejectedHint}</p>
                  <ul className="mt-1 space-y-1">
                    {proposal.rejected.map((reason, i) => (
                      <li key={i}>• {reason}</li>
                    ))}
                  </ul>
                </Alert>
              )}

              <p className="border-t border-edge-subtle pt-2 text-xs text-ink-subtle">
                {proposal.disclaimer}
              </p>
            </CardBody>
          </Card>
        )}
      </CardBody>
    </Card>
  );
}
