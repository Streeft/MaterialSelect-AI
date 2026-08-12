"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { countLabel, prettyUnit } from "@/lib/format";
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Section,
  Select,
  Stepper,
  TBody,
  Table,
  TableScroll,
  Td,
  Tr,
  type Step as StepItem,
  type StepStatus,
} from "@/components/ui";
import { IconArrowRight, IconPlus, IconTrash } from "@/components/ui/icons";
import {
  ConstraintEditor,
  type ConstraintRow,
  emptyConstraint,
  toConstraintPayload,
} from "@/components/selection/ConstraintEditor";
import {
  IndexCard,
  IndexPicker,
  describeCustomIndex,
  describeIndex,
  type IndexDescriptor,
} from "@/components/selection/IndexCard";
import { ResultsView } from "@/components/selection/ResultsView";
import { AIAssistPanel, type AcceptedSuggestions } from "@/components/ai/AIAssistPanel";
import { StudyExplanation } from "@/components/ai/StudyExplanation";
import { ExportButtons } from "@/components/ExportButtons";
import { EngineeringReportLink } from "@/components/EngineeringReportLink";

const t = ptBR.selection;
type Step = "function" | "constraints" | "objective" | "results";

/**
 * Deep links into the wizard.
 *
 * The home page presents the method as four clickable steps, and a step that
 * lands on the first screen every time is not a step. The slugs are pt-BR
 * because the routes are; the identifiers stay English like everything else.
 */
const STEP_BY_SLUG: Record<string, Step> = {
  funcao: "function",
  restricoes: "constraints",
  objetivo: "objective",
  resultados: "results",
};

const STEPS: StepItem<Step>[] = [
  { id: "function", label: t.stepFunction },
  { id: "constraints", label: t.stepConstraints },
  { id: "objective", label: t.stepObjective },
  { id: "results", label: t.stepResults, blockedReason: t.blockedResults },
];

interface CriterionRow {
  id: string;
  key: string;
  direction: "" | "max" | "min";
  weight: string;
}

let counter = 0;
const nextId = () => `row-${counter++}`;

/**
 * How many candidates are still standing, at every step.
 *
 * It used to be a sentence next to the combinator on the constraints step, so
 * the one number the whole method turns on disappeared the moment the reader
 * moved on. Here it is an element, it is always present, and it says what it is
 * doing while it recounts instead of showing a stale number as if it were fresh.
 */
function CandidateCounter({
  count,
  total,
  pending,
  failed,
  className,
}: {
  count: number | null;
  total: number | null;
  pending: boolean;
  failed: boolean;
  className?: string;
}) {
  return (
    <div
      aria-live="polite"
      className={
        "flex items-baseline gap-2 rounded-control border border-edge bg-surface-sunken px-3 py-1.5 " +
        (className ?? "")
      }
    >
      <span className="text-2xs uppercase tracking-wide text-ink-muted">{t.remaining}</span>
      {failed ? (
        <span className="text-xs text-danger-fg">{t.counterError}</span>
      ) : count === null || total === null ? (
        <span className="text-xs text-ink-muted">{t.counterPending}</span>
      ) : (
        <>
          <span className="text-lg font-semibold leading-none tabular-nums text-brand-700">
            {count}
          </span>
          <span className="text-2xs text-ink-muted">
            {t.of} {total}
            {pending ? ` · ${t.counterPending}` : ""}
          </span>
        </>
      )}
    </div>
  );
}

export default function SelectionPage() {
  // `useSearchParams` opts the subtree out of prerendering unless it sits
  // behind a boundary; without this, `next build` refuses the page.
  return (
    <Suspense fallback={<LoadingState />}>
      <SelectionWizard />
    </Suspense>
  );
}

function SelectionWizard() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>(
    () => STEP_BY_SLUG[params.get("etapa") ?? ""] ?? "function",
  );

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

  const fail = (err: unknown) => setError(err instanceof ApiError ? err.message : t.genericError);

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

  // Same resolution as `activeIndex`, but keeping the fields the run payload
  // has no use for and the reader does: the declared assumptions and the
  // dimension of the result.
  const indexDescriptor = useMemo<IndexDescriptor | null>(() => {
    if (indexMode === "none") return null;
    if (indexMode === "custom") {
      const expression = customExpression.trim();
      return expression ? describeCustomIndex(expression, indexGoal) : null;
    }
    const chosen = indices.data?.find((i) => i.slug === indexMode);
    return chosen ? describeIndex(chosen) : null;
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

  // The live count, on every step — not only where the constraints are edited.
  // Constraints only: adding the index here would make the number answer a
  // different question from the one the label asks.
  const preview = useQuery({
    queryKey: ["selection-preview", JSON.stringify({ combinator, c: constraintPayload() })],
    queryFn: () =>
      runSelection({ combinator, constraints: constraintPayload(), index: null, ranking: null }),
    // Keep the previous count on screen while the next one is in flight, so the
    // element does not blink between every keystroke.
    placeholderData: (previous) => previous,
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

  // `?estudo=<id>` is where the home page's "Retomar" lands. Once, on arrival:
  // re-loading on every render would overwrite whatever the reader has typed
  // since.
  const requestedStudy = params.get("estudo");
  const loadedFromUrl = useRef(false);
  useEffect(() => {
    if (loadedFromUrl.current || !requestedStudy) return;
    const id = Number(requestedStudy);
    if (!Number.isInteger(id) || id <= 0) return;
    loadedFromUrl.current = true;
    loadStudy.mutate(id);
  }, [requestedStudy, loadStudy]);

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

  const indexIsCriterion = criteria.some((c) => c.key === "__index__");
  const hasConstraints = constraintPayload().length > 0;
  const hasObjective = activeIndex !== null || criteriaPayload().length > 0;
  const canSave = name.trim().length > 0;

  /**
   * What each step is, right now.
   *
   * "Done" is not "visited": it means the step produced something the run will
   * use. Results is the only step that can be blocked, because it is the only
   * one whose content the reader cannot create by typing.
   */
  function statusOf(item: StepItem<Step>): StepStatus {
    if (item.id === step) return "current";
    switch (item.id) {
      case "function":
        return name.trim() || functionText.trim() ? "done" : "upcoming";
      case "constraints":
        return hasConstraints ? "done" : "upcoming";
      case "objective":
        return hasObjective ? "done" : "upcoming";
      case "results":
        return result ? "done" : "blocked";
    }
  }

  /** The one action this step is for, plus whatever supports it. */
  function actionsForStep() {
    switch (step) {
      case "function":
        return (
          <Button
            variant="primary"
            icon={<IconArrowRight />}
            onClick={() => setStep("constraints")}
          >
            {t.stepConstraints}
          </Button>
        );
      case "constraints":
        return (
          <>
            <Button
              variant="secondary"
              icon={<IconPlus />}
              onClick={() => setConstraints([...constraints, emptyConstraint(nextId())])}
            >
              {t.addConstraint}
            </Button>
            <Button variant="primary" icon={<IconArrowRight />} onClick={() => setStep("objective")}>
              {t.stepObjective}
            </Button>
          </>
        );
      case "objective":
        return (
          <>
            <Button variant="secondary" onClick={() => setStep("constraints")}>
              {t.back}
            </Button>
            <Button variant="primary" loading={run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? t.running : t.run}
            </Button>
          </>
        );
      case "results":
        return (
          <>
            <Button variant="secondary" onClick={() => setStep("objective")}>
              {t.back}
            </Button>
            <Button
              variant="primary"
              disabled={!canSave}
              loading={save.isPending}
              onClick={() => {
                setSaveMessage(null);
                save.mutate();
              }}
            >
              {t.saveStudy}
            </Button>
          </>
        );
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
          <p className="text-sm text-ink-muted">{t.subtitle}</p>
        </div>

        <Stepper
          label={ptBR.ui.steps}
          steps={STEPS}
          statusOf={statusOf}
          current={step}
          onSelect={setStep}
        />

        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}

        {/* Step 1: function */}
        {step === "function" && (
          <Section title={t.functionTitle} description={t.functionHint}>
            <Card>
              <CardBody className="grid gap-3 sm:grid-cols-2">
                <Field label={t.studyName} className="sm:col-span-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label={t.functionText}>
                  <Input
                    value={functionText}
                    onChange={(e) => setFunctionText(e.target.value)}
                  />
                </Field>
                <Field label={t.objectiveText}>
                  <Input
                    value={objectiveText}
                    onChange={(e) => setObjectiveText(e.target.value)}
                  />
                </Field>
                <Field label={t.freeVariables} className="sm:col-span-2">
                  <Input
                    value={freeVariables}
                    onChange={(e) => setFreeVariables(e.target.value)}
                  />
                </Field>
              </CardBody>
            </Card>
          </Section>
        )}

        {/* Optional assistance, on the step where a problem is described. */}
        {step === "function" && <AIAssistPanel onApply={applySuggestions} />}

        {/* Step 2: constraints */}
        {step === "constraints" && (
          <Section
            title={t.constraintsTitle}
            description={t.constraintsHint}
            actions={
              <Field label={t.combinator} className="w-28">
                <Select
                  value={combinator}
                  onChange={(e) => setCombinator(e.target.value as "AND" | "OR")}
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </Select>
              </Field>
            }
          >
            <ConstraintEditor
              rows={constraints}
              properties={properties.data ?? []}
              classes={classes.data ?? []}
              onChange={setConstraints}
            />
          </Section>
        )}

        {/* Step 3: objective (index + ranking) */}
        {step === "objective" && (
          <div className="space-y-5">
            <Section title={t.objectiveTitle}>
              <Card>
                <CardBody className="space-y-3">
                  <IndexPicker
                    indices={indices.data ?? []}
                    value={indexMode}
                    onChange={(next) => {
                      setIndexMode(next);
                      setValidation(null);
                    }}
                    hint={t.objectiveHint}
                    customSlot={
                      <>
                        <div className="flex flex-wrap items-end gap-3">
                          <Field label={t.expression} className="w-72">
                            <Input
                              value={customExpression}
                              onChange={(e) => setCustomExpression(e.target.value)}
                              placeholder="modulo_young / densidade"
                            />
                          </Field>
                          <Field label={t.goal} className="w-40">
                            <Select
                              value={indexGoal}
                              onChange={(e) => setIndexGoal(e.target.value as Goal)}
                            >
                              <option value="maximize">{t.maximize}</option>
                              <option value="minimize">{t.minimize}</option>
                            </Select>
                          </Field>
                          <Button onClick={() => validateExpr.mutate()} loading={validateExpr.isPending}>
                            {t.validate}
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-ink-muted">
                          {t.expressionHint}{" "}
                          {properties.data && (
                            <span className="text-ink-subtle">
                              ({t.variablesAvailable}:{" "}
                              {properties.data.map((p) => p.slug).join(", ")})
                            </span>
                          )}
                        </p>
                      </>
                    }
                  />
                  {validation && <p className="text-xs text-ink-muted">{validation}</p>}
                  {/* The conditions of validity, shown without asking for a click —
                      an index that does not fit the problem is worse than no index. */}
                  {indexDescriptor && <IndexCard index={indexDescriptor} />}
                </CardBody>
              </Card>
            </Section>

            <Section
              title={t.rankingTitle}
              description={t.rankingHint}
              actions={
                <Field label={t.normalization} className="w-40">
                  <Select
                    value={normalization}
                    onChange={(e) => setNormalization(e.target.value as NormalizationMethod)}
                  >
                    <option value="minmax">{t.normMinmax}</option>
                    <option value="vector">{t.normVector}</option>
                  </Select>
                </Field>
              }
            >
              <Card>
                <CardBody className="space-y-3">
                  {criteria.map((c, position) => (
                    <fieldset key={c.id} className="flex flex-wrap items-end gap-3">
                      <legend className="sr-only">
                        {t.criterion} {position + 1}
                      </legend>
                      <Field label={t.criterion} className="w-56">
                        <Select
                          value={c.key}
                          onChange={(e) =>
                            setCriteria(
                              criteria.map((x) =>
                                x.id === c.id ? { ...x, key: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          <option value="">{t.selectCriterion}</option>
                          {activeIndex && <option value="__index__">{t.useIndexCriterion}</option>}
                          {(properties.data ?? []).map((p) => (
                            <option key={p.slug} value={p.slug}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t.direction} className="w-52">
                        <Select
                          value={c.direction}
                          onChange={(e) =>
                            setCriteria(
                              criteria.map((x) =>
                                x.id === c.id
                                  ? { ...x, direction: e.target.value as "" | "max" | "min" }
                                  : x,
                              ),
                            )
                          }
                        >
                          <option value="">{t.autoDirection}</option>
                          <option value="max">{t.dirMax}</option>
                          <option value="min">{t.dirMin}</option>
                        </Select>
                      </Field>
                      <Field label={t.weight} className="w-24">
                        <Input
                          inputMode="decimal"
                          className="tabular-nums"
                          value={c.weight}
                          onChange={(e) =>
                            setCriteria(
                              criteria.map((x) =>
                                x.id === c.id ? { ...x, weight: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<IconTrash />}
                        onClick={() => setCriteria(criteria.filter((x) => x.id !== c.id))}
                      >
                        {ptBR.actions.remove}
                      </Button>
                    </fieldset>
                  ))}
                  <Button
                    icon={<IconPlus />}
                    onClick={() =>
                      setCriteria([
                        ...criteria,
                        {
                          id: nextId(),
                          key: activeIndex && !indexIsCriterion ? "__index__" : "",
                          direction: "",
                          weight: "1",
                        },
                      ])
                    }
                  >
                    {t.addCriterion}
                  </Button>
                </CardBody>
              </Card>
            </Section>
          </div>
        )}

        {/* Step 4: results */}
        {step === "results" && result && <ResultsView result={result} />}
        {step === "results" && !result && (
          <EmptyState title={t.blockedResults} description={t.emptyResults} />
        )}

        {saveMessage && (
          <Alert tone="success" role="status">
            {saveMessage}
          </Alert>
        )}

        {/* The action bar.
            Sticky rather than fixed: pinned to the bottom of the viewport while
            the wizard is on screen, and out of the way when the reader reaches
            the footer — where the two standing notices live and must not be
            covered by a floating strip. */}
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-edge bg-surface-raised/95 px-4 py-3 backdrop-blur">
          <div
            role="group"
            aria-label={t.actionBar}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <CandidateCounter
              count={preview.data?.final_count ?? null}
              total={preview.data?.initial_count ?? null}
              pending={preview.isFetching}
              failed={preview.isError}
            />
            <div className="flex flex-wrap items-center gap-2">
              {step === "results" && !canSave && (
                <span className="text-2xs text-ink-muted">{t.saveNeedsName}</span>
              )}
              {actionsForStep()}
            </div>
          </div>
        </div>
      </div>

      {/* Saved studies */}
      <Section title={t.savedStudies}>
        {!studies.data || studies.data.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.noStudies}</p>
        ) : (
          <TableScroll label={t.savedStudies}>
            <Table>
              <TBody>
                {studies.data.map((s) => (
                  <Tr key={s.id}>
                    <Td>
                      <span className="font-medium text-ink">{s.name}</span>
                      <div className="mt-1">
                        <ExportButtons
                          urlFor={(format) => studyExportUrl(s.id, format)}
                          label={ptBR.exports.study}
                        />
                      </div>
                      <div className="mt-2">
                        <EngineeringReportLink studyId={s.id} />
                      </div>
                      <StudyExplanation studyId={s.id} />
                    </Td>
                    <Td className="align-top text-2xs text-ink-subtle">
                      {countLabel(s.constraint_count, ptBR.home.constraintOne, ptBR.home.constraintMany)}{" "}
                      · {countLabel(s.criterion_count, ptBR.home.criterionOne, ptBR.home.criterionMany)}
                    </Td>
                    <Td className="align-top">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => runSaved.mutate(s.id)}>
                          {t.runSaved}
                        </Button>
                        <Button size="sm" onClick={() => loadStudy.mutate(s.id)}>
                          {t.load}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            if (window.confirm(t.deleteConfirm)) removeStudy.mutate(s.id);
                          }}
                        >
                          {t.delete}
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        )}
      </Section>
    </div>
  );
}
