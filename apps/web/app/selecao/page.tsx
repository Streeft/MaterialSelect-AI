"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createStudy,
  deleteStudy,
  evaluateIndex,
  getStudy,
  listClasses,
  listPerformanceIndices,
  listProperties,
  listStudies,
  runSelection,
  runStudy,
  studyExportUrl,
} from "@/lib/api";
import type {
  ConstraintIn,
  CriterionIn,
  Goal,
  IndexIn,
  NormalizationMethod,
  RunRequest,
  RunResult,
  StudyDetail,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { prettyUnit } from "@/lib/format";
import {
  ConstraintEditor,
  type ConstraintRow,
  emptyConstraint,
  toConstraintPayload,
} from "@/components/selection/ConstraintEditor";
import { ResultsView } from "@/components/selection/ResultsView";
import { AIAssistPanel, type AcceptedSuggestions } from "@/components/ai/AIAssistPanel";
import { StudyExplanation } from "@/components/ai/StudyExplanation";
import { ExportButtons } from "@/components/ExportButtons";

const t = ptBR.selection;
type Step = "function" | "constraints" | "objective" | "results";

interface CriterionRow {
  id: string;
  key: string;
  direction: "" | "max" | "min";
  weight: string;
}

let counter = 0;
const nextId = () => `row-${counter++}`;

export default function SelectionPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("function");

  const [name, setName] = useState("");
  const [functionText, setFunctionText] = useState("");
  const [objectiveText, setObjectiveText] = useState("");
  const [freeVariables, setFreeVariables] = useState("");
  const [combinator, setCombinator] = useState<"AND" | "OR">("AND");
  const [constraints, setConstraints] = useState<ConstraintRow[]>([]);

  const [indexMode, setIndexMode] = useState<string>("none"); // "none" | slug | "custom"
  const [customExpression, setCustomExpression] = useState("");
  const [indexGoal, setIndexGoal] = useState<Goal>("maximize");
  const [validation, setValidation] = useState<string | null>(null);

  const [criteria, setCriteria] = useState<CriterionRow[]>([]);
  const [normalization, setNormalization] = useState<NormalizationMethod>("minmax");

  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const indices = useQuery({ queryKey: ["performance-indices"], queryFn: listPerformanceIndices });
  const studies = useQuery({ queryKey: ["studies"], queryFn: listStudies });

  const fail = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : t.genericError);

  // Resolve the active index (prebuilt or custom) into an IndexIn payload.
  const activeIndex = useMemo<IndexIn | null>(() => {
    if (indexMode === "none") return null;
    if (indexMode === "custom") {
      return customExpression.trim()
        ? { name: t.customIndex, expression: customExpression.trim(), goal: indexGoal }
        : null;
    }
    const chosen = indices.data?.find((i) => i.slug === indexMode);
    return chosen ? { name: chosen.name, expression: chosen.expression, goal: chosen.goal } : null;
  }, [indexMode, customExpression, indexGoal, indices.data]);

  const constraintPayload = (): ConstraintIn[] => toConstraintPayload(constraints);

  function criteriaPayload(): CriterionIn[] {
    return criteria
      .map((c): CriterionIn | null => {
        const weight = Number(c.weight.replace(",", "."));
        if (!c.key || !Number.isFinite(weight) || weight <= 0) return null;
        return { key: c.key, weight, direction: c.direction || null };
      })
      .filter((c): c is CriterionIn => c !== null);
  }

  function buildRequest(includeObjective: boolean): RunRequest {
    return {
      combinator,
      constraints: constraintPayload(),
      index: includeObjective ? activeIndex : null,
      ranking:
        includeObjective && criteriaPayload().length > 0
          ? { normalization, criteria: criteriaPayload(), run_sensitivity: true }
          : null,
    };
  }

  // Live candidate count preview on the constraints step (constraints only).
  const preview = useQuery({
    queryKey: ["selection-preview", JSON.stringify({ combinator, c: constraintPayload() })],
    queryFn: () => runSelection({ combinator, constraints: constraintPayload(), index: null, ranking: null }),
    enabled: step === "constraints",
  });

  const run = useMutation({
    mutationFn: () => runSelection(buildRequest(true)),
    onSuccess: (data) => {
      setResult(data);
      setStep("results");
      setError(null);
    },
    onError: fail,
  });

  const save = useMutation({
    mutationFn: () =>
      createStudy({
        name: name.trim(),
        description: null,
        function_text: functionText.trim() || null,
        objective_text: objectiveText.trim() || null,
        free_variables: freeVariables.split(",").map((s) => s.trim()).filter(Boolean),
        combinator,
        constraints: constraintPayload(),
        index: activeIndex,
        normalization,
        criteria: criteriaPayload(),
      }),
    onSuccess: () => {
      setSaveMessage(t.saved);
      qc.invalidateQueries({ queryKey: ["studies"] });
    },
    onError: fail,
  });

  const validateExpr = useMutation({
    mutationFn: () => evaluateIndex(customExpression.trim(), indexGoal),
    onSuccess: (res) =>
      setValidation(`${t.validationOk} ${t.dimension}: ${prettyUnit(res.dimension)}`),
    onError: (err) => setValidation(err instanceof ApiError ? err.message : t.genericError),
  });

  const loadStudy = useMutation({
    mutationFn: (id: number) => getStudy(id),
    onSuccess: (s: StudyDetail) => {
      setName(s.name);
      setFunctionText(s.function_text ?? "");
      setObjectiveText(s.objective_text ?? "");
      setFreeVariables(s.free_variables.join(", "));
      setCombinator(s.combinator);
      setConstraints(
        s.constraints.map((c) => ({
          ...emptyConstraint(nextId()),
          operator: c.operator,
          property_slug: c.property_slug ?? "",
          value: c.value?.toString() ?? "",
          value_min: c.value_min?.toString() ?? "",
          value_max: c.value_max?.toString() ?? "",
          unit: c.unit ?? "",
          class_slugs: c.class_slugs ?? [],
          text: c.text ?? "",
        })),
      );
      if (s.index) {
        setIndexMode("custom");
        setCustomExpression(s.index.expression);
        setIndexGoal(s.index.goal);
      } else {
        setIndexMode("none");
      }
      setNormalization(s.normalization);
      setCriteria(
        s.criteria.map((c) => ({
          id: nextId(),
          key: c.key,
          direction: (c.direction as "max" | "min" | null) ?? "",
          weight: c.weight.toString(),
        })),
      );
      setResult(null);
      setStep("constraints");
    },
    onError: fail,
  });

  const removeStudy = useMutation({
    mutationFn: (id: number) => deleteStudy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studies"] }),
  });

  const runSaved = useMutation({
    mutationFn: (id: number) => runStudy(id),
    onSuccess: (data) => {
      setResult(data);
      setStep("results");
    },
    onError: fail,
  });

  /**
   * Merge the suggestions the user ticked into the wizard.
   *
   * Constraints are appended, never substituted: an interpretation adds to what
   * the user already wrote rather than overwriting it. The index arrives as a
   * catalogue expression, which the objective step validates like any other.
   */
  function applySuggestions(accepted: AcceptedSuggestions) {
    if (accepted.functionText) setFunctionText(accepted.functionText);
    if (accepted.objectiveText) setObjectiveText(accepted.objectiveText);
    if (accepted.freeVariables.length > 0) setFreeVariables(accepted.freeVariables.join(", "));
    if (accepted.constraints.length > 0) {
      setConstraints((current) => [
        ...current,
        ...accepted.constraints.map(({ constraint }) => ({
          ...emptyConstraint(nextId()),
          operator: constraint.operator,
          property_slug: constraint.property_slug ?? "",
          value: constraint.value?.toString() ?? "",
          value_min: constraint.value_min?.toString() ?? "",
          value_max: constraint.value_max?.toString() ?? "",
          unit: constraint.unit ?? "",
          class_slugs: constraint.class_slugs ?? [],
          text: constraint.text ?? "",
        })),
      ]);
    }
    if (accepted.index) {
      setIndexMode(accepted.index.slug);
      setIndexGoal(accepted.index.goal);
    }
  }

  const inputClass =
    "rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none";

  const steps: { key: Step; label: string }[] = [
    { key: "function", label: t.stepFunction },
    { key: "constraints", label: t.stepConstraints },
    { key: "objective", label: t.stepObjective },
    { key: "results", label: t.stepResults },
  ];

  const indexIsCriterion = criteria.some((c) => c.key === "__index__");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
          <p className="text-sm text-slate-500">{t.subtitle}</p>
        </div>
        <nav aria-label="Etapas" className="flex flex-wrap gap-2 text-xs">
          {steps.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStep(s.key)}
              className={
                "rounded-full px-3 py-1 " +
                (step === s.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
              }
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {/* Step 1: function */}
      {step === "function" && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">{t.functionTitle}</h2>
          <p className="text-xs text-slate-500">{t.functionHint}</p>
          <label className="block text-sm text-slate-600">
            {t.studyName}
            <input className={`${inputClass} mt-1 block w-full`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm text-slate-600">
            {t.functionText}
            <input className={`${inputClass} mt-1 block w-full`} value={functionText} onChange={(e) => setFunctionText(e.target.value)} />
          </label>
          <label className="block text-sm text-slate-600">
            {t.objectiveText}
            <input className={`${inputClass} mt-1 block w-full`} value={objectiveText} onChange={(e) => setObjectiveText(e.target.value)} />
          </label>
          <label className="block text-sm text-slate-600">
            {t.freeVariables}
            <input className={`${inputClass} mt-1 block w-full`} value={freeVariables} onChange={(e) => setFreeVariables(e.target.value)} />
          </label>
          <button type="button" onClick={() => setStep("constraints")} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {t.stepConstraints} →
          </button>
        </section>
      )}

      {/* Optional assistance, on the step where a problem is described. */}
      {step === "function" && <AIAssistPanel onApply={applySuggestions} />}

      {/* Step 2: constraints */}
      {step === "constraints" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">{t.constraintsTitle}</h2>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1 text-slate-600">
                {t.combinator}
                <select className={inputClass} value={combinator} onChange={(e) => setCombinator(e.target.value as "AND" | "OR")}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </label>
              {preview.data && (
                <span className="text-slate-500">
                  {t.remaining}: <strong className="text-brand-700">{preview.data.final_count}</strong> {t.of}{" "}
                  {preview.data.initial_count}
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">{t.constraintsHint}</p>
          <ConstraintEditor
            rows={constraints}
            properties={properties.data ?? []}
            classes={classes.data ?? []}
            onChange={setConstraints}
          />
          <div className="flex gap-3">
            <button type="button" onClick={() => setConstraints([...constraints, emptyConstraint(nextId())])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              + {t.addConstraint}
            </button>
            <button type="button" onClick={() => setStep("objective")} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              {t.stepObjective} →
            </button>
          </div>
        </section>
      )}

      {/* Step 3: objective (index + ranking) */}
      {step === "objective" && (
        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">{t.performanceIndex}</h2>
            <p className="mb-2 text-xs text-slate-500">{t.objectiveHint}</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-slate-600">
                {t.performanceIndex}
                <select className={`${inputClass} mt-1 block`} value={indexMode} onChange={(e) => { setIndexMode(e.target.value); setValidation(null); }}>
                  <option value="none">{t.noIndex}</option>
                  {(indices.data ?? []).map((i) => (
                    <option key={i.slug} value={i.slug}>{i.name} — {i.expression}</option>
                  ))}
                  <option value="custom">{t.customIndex}</option>
                </select>
              </label>
              {indexMode === "custom" && (
                <>
                  <label className="text-sm text-slate-600">
                    {t.expression}
                    <input className={`${inputClass} mt-1 block w-72`} value={customExpression} onChange={(e) => setCustomExpression(e.target.value)} placeholder="modulo_young / densidade" />
                  </label>
                  <label className="text-sm text-slate-600">
                    {t.goal}
                    <select className={`${inputClass} mt-1 block`} value={indexGoal} onChange={(e) => setIndexGoal(e.target.value as Goal)}>
                      <option value="maximize">{t.maximize}</option>
                      <option value="minimize">{t.minimize}</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => validateExpr.mutate()} className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                    {t.validate}
                  </button>
                </>
              )}
            </div>
            {indexMode === "custom" && (
              <p className="mt-2 text-xs text-slate-500">
                {t.expressionHint}{" "}
                {properties.data && (
                  <span className="text-slate-400">
                    ({t.variablesAvailable}: {properties.data.map((p) => p.slug).join(", ")})
                  </span>
                )}
              </p>
            )}
            {validation && <p className="mt-1 text-xs text-slate-600">{validation}</p>}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">{t.rankingTitle}</h2>
              <label className="flex items-center gap-1 text-sm text-slate-600">
                {t.normalization}
                <select className={inputClass} value={normalization} onChange={(e) => setNormalization(e.target.value as NormalizationMethod)}>
                  <option value="minmax">{t.normMinmax}</option>
                  <option value="vector">{t.normVector}</option>
                </select>
              </label>
            </div>
            <p className="mb-2 text-xs text-slate-500">{t.rankingHint}</p>
            <div className="space-y-2">
              {criteria.map((c) => (
                <div key={c.id} className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-500">
                    {t.criterion}
                    <select className={`${inputClass} mt-0.5 block`} value={c.key}
                      onChange={(e) => setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, key: e.target.value } : x)))}>
                      <option value="">—</option>
                      {activeIndex && <option value="__index__">{t.useIndexCriterion}</option>}
                      {(properties.data ?? []).map((p) => (
                        <option key={p.slug} value={p.slug}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-500">
                    {t.direction}
                    <select className={`${inputClass} mt-0.5 block`} value={c.direction}
                      onChange={(e) => setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, direction: e.target.value as "" | "max" | "min" } : x)))}>
                      <option value="">auto</option>
                      <option value="max">{t.dirMax}</option>
                      <option value="min">{t.dirMin}</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-500">
                    {t.weight}
                    <input className={`${inputClass} mt-0.5 block w-20`} value={c.weight} inputMode="decimal"
                      onChange={(e) => setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, weight: e.target.value } : x)))} />
                  </label>
                  <button type="button" onClick={() => setCriteria(criteria.filter((x) => x.id !== c.id))} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">
                    {ptBR.actions.remove}
                  </button>
                </div>
              ))}
            </div>
            <button type="button"
              onClick={() => setCriteria([...criteria, { id: nextId(), key: activeIndex && !indexIsCriterion ? "__index__" : "", direction: "", weight: "1" }])}
              className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              + {t.addCriterion}
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => run.mutate()} disabled={run.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {run.isPending ? t.running : t.run}
            </button>
            <button type="button" onClick={() => { setSaveMessage(null); save.mutate(); }} disabled={!name.trim() || save.isPending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {t.saveStudy}
            </button>
            {saveMessage && <span className="self-center text-sm text-green-700">{saveMessage}</span>}
          </div>
        </section>
      )}

      {/* Step 4: results */}
      {step === "results" && result && <ResultsView result={result} />}
      {step === "results" && !result && <p className="text-sm text-slate-500">{t.emptyResults}</p>}

      {/* Saved studies */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">{t.savedStudies}</h2>
        {!studies.data || studies.data.length === 0 ? (
          <p className="text-sm text-slate-500">{t.noStudies}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <tbody className="divide-y divide-slate-100">
                {studies.data.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-medium text-slate-700">
                      {s.name}
                      <div className="mt-1">
                        <ExportButtons
                          urlFor={(format) => studyExportUrl(s.id, format)}
                          label={ptBR.exports.study}
                        />
                      </div>
                      <StudyExplanation studyId={s.id} />
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-400">
                      {s.constraint_count} restrições · {s.criterion_count} critérios
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => runSaved.mutate(s.id)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                          {t.runSaved}
                        </button>
                        <button type="button" onClick={() => loadStudy.mutate(s.id)} className="rounded border border-slate-300 px-2 py-1 text-xs text-brand-700 hover:bg-slate-50">
                          {t.load}
                        </button>
                        <button type="button" onClick={() => { if (window.confirm(t.deleteConfirm)) removeStudy.mutate(s.id); }} className="rounded border border-slate-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                          {t.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
