"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError, getAIStatus, interpretStatement } from "@/lib/api";
import type { Interpretation, SuggestedConstraint, SuggestedIndex } from "@/lib/types";
import { ptBR } from "@/lib/i18n";

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
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-700">{t.title}</h2>
        <p className="mt-1 text-xs text-slate-500">{t.disabled}</p>
      </section>
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

  const inputClass =
    "rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <section className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{t.title}</h2>
        {status.data?.simulated && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
            {t.simulatedBadge}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-600">{t.subtitle}</p>

      <label className="block text-sm text-slate-600">
        {t.statementLabel}
        <textarea
          className={`${inputClass} mt-1 block w-full`}
          rows={3}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder={t.statementPlaceholder}
        />
      </label>

      <button
        type="button"
        onClick={() => interpret.mutate()}
        disabled={!statement.trim() || interpret.isPending}
        className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
      >
        {interpret.isPending ? t.interpreting : t.interpret}
      </button>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {proposal && (
        <div className="space-y-3 rounded-md border border-violet-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-800">{t.proposalTitle}</h3>

          <ul className="space-y-1.5 text-sm">
            {proposal.function_text && (
              <li className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={useFunction}
                  onChange={(e) => setUseFunction(e.target.checked)}
                  aria-label={t.functionRead}
                />
                <span>
                  <strong className="text-slate-600">{t.functionRead}:</strong>{" "}
                  {proposal.function_text}
                </span>
              </li>
            )}
            {proposal.objective_text && (
              <li className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={useObjective}
                  onChange={(e) => setUseObjective(e.target.checked)}
                  aria-label={t.objectiveRead}
                />
                <span>
                  <strong className="text-slate-600">{t.objectiveRead}:</strong>{" "}
                  {proposal.objective_text}
                </span>
              </li>
            )}
            {proposal.free_variables.length > 0 && (
              <li className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={useFreeVariables}
                  onChange={(e) => setUseFreeVariables(e.target.checked)}
                  aria-label={t.freeVariablesRead}
                />
                <span>
                  <strong className="text-slate-600">{t.freeVariablesRead}:</strong>{" "}
                  {proposal.free_variables.join(", ")}
                </span>
              </li>
            )}
          </ul>

          {proposal.constraints.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.constraintsRead}
              </h4>
              <ul className="mt-1 space-y-1.5 text-sm">
                {proposal.constraints.map((suggestion, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={acceptedConstraints.has(i)}
                      onChange={() => toggleConstraint(i)}
                      aria-label={suggestion.rationale}
                    />
                    <span>
                      {suggestion.rationale}
                      <span className="block text-xs text-slate-400">
                        {t.evidence}: “{suggestion.evidence}”
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {proposal.indices.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.indicesRead}
              </h4>
              <ul className="mt-1 space-y-1.5 text-sm">
                {proposal.indices.map((suggestion) => (
                  <li key={suggestion.slug} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="ai-index"
                      className="mt-1"
                      checked={acceptedIndex === suggestion.slug}
                      onChange={() => setAcceptedIndex(suggestion.slug)}
                      aria-label={suggestion.name}
                    />
                    <span>
                      <strong>{suggestion.name}</strong>{" "}
                      <code className="text-xs text-slate-500">{suggestion.expression}</code>
                      <span className="block text-xs text-slate-400">{suggestion.rationale}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {proposal.chart && (
            <p className="text-xs text-slate-500">
              <strong className="uppercase tracking-wide">{t.chartRead}:</strong>{" "}
              {proposal.chart.y} × {proposal.chart.x} ({proposal.chart.scale}) —{" "}
              {proposal.chart.rationale}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={apply}
              disabled={selectedCount === 0}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {t.apply}
            </button>
            {selectedCount === 0 && (
              <span className="text-xs text-slate-500">{t.nothingToApply}</span>
            )}
            {applied && <span className="text-sm text-green-700">{t.applied}</span>}
          </div>

          {proposal.open_questions.length > 0 && (
            <div className="rounded bg-amber-50 px-3 py-2">
              <h4 className="text-xs font-semibold text-amber-800">{t.openQuestions}</h4>
              <ul className="mt-1 space-y-1 text-xs text-amber-800">
                {proposal.open_questions.map((question, i) => (
                  <li key={i}>• {question}</li>
                ))}
              </ul>
            </div>
          )}

          {proposal.rejected.length > 0 && (
            <div className="rounded bg-slate-50 px-3 py-2">
              <h4 className="text-xs font-semibold text-slate-700">{t.rejected}</h4>
              <p className="text-xs text-slate-500">{t.rejectedHint}</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {proposal.rejected.map((reason, i) => (
                  <li key={i}>• {reason}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="border-t border-slate-100 pt-2 text-xs text-slate-400">
            {proposal.disclaimer}
          </p>
        </div>
      )}
    </section>
  );
}
