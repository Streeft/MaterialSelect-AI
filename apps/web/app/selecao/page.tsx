"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ConstraintGroupIn,
  CriterionIn,
  Goal,
  IndexIn,
  MethodLiteral,
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
  ButtonGroup,
  ButtonGroupItem,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  Input,
  LoadingState,
  Section,
  Select,
  SelectOption,
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
  type ConstraintGroupState,
  emptyConstraint,
  emptyGroup,
  toConstraintPayload,
  countConstraints,
} from "@/components/selection/ConstraintEditor";
import { AhpMatrixInput, type AhpCriterionRef } from "@/components/selection/AhpMatrixInput";
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
  // M6: the root of the nested AND/OR constraint tree. Its own `operator`
  // replaces the page-level combinator picker this used to be — operator is
  // now a per-group property, not a study-level one (see ConstraintEditor).
  const [rootGroup, setRootGroup] = useState<ConstraintGroupState>(() => emptyGroup(nextId()));

  const [indexMode, setIndexMode] = useState<string>("none"); // "none" | slug | "custom"
  const [customExpression, setCustomExpression] = useState("");
  const [indexGoal, setIndexGoal] = useState<Goal>("maximize");
  const [validation, setValidation] = useState<string | null>(null);

  const [criteria, setCriteria] = useState<CriterionRow[]>([]);
  const [normalization, setNormalization] = useState<NormalizationMethod>("minmax");
  const [method, setMethod] = useState<MethodLiteral>("weighted_sum");
  // AHP derives *weights*, not a fourth ranking method — so it only shows up
  // as an alternative input mode for the weight fields, gated on
  // weighted_sum, never as another entry in `method` above.
  const [useAhp, setUseAhp] = useState(false);

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

  const rootGroupPayload = (): ConstraintGroupIn => toConstraintPayload(rootGroup);

  // Only the criteria that already name a property (or the index) are worth
  // comparing pairwise — an empty row has nothing for AHP to weigh.
  const ahpCriteria = useMemo<AhpCriterionRef[]>(
    () =>
      criteria
        .filter((c) => c.key)
        .map((c) => ({
          key: c.key,
          label:
            c.key === "__index__"
              ? t.useIndexCriterion
              : properties.data?.find((p) => p.slug === c.key)?.name ?? c.key,
        })),
    [criteria, properties.data],
  );

  // Functional update, no `criteria` in the dependency list: this keeps the
  // callback referentially stable across renders, which is what lets
  // AhpMatrixInput's own effect key on it safely instead of re-firing
  // `onDerived` on every unrelated keystroke elsewhere on the page.
  const applyAhpWeights = useCallback((weights: Record<string, number>) => {
    setCriteria((current) =>
      current.map((c) => {
        const w = weights[c.key];
        return w === undefined ? c : { ...c, weight: w.toFixed(4) };
      }),
    );
  }, []);

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
      root_group: rootGroupPayload(),
      index: includeObjective ? activeIndex : null,
      ranking:
        includeObjective && criteriaPayload().length > 0
          ? { normalization, method, criteria: criteriaPayload(), run_sensitivity: true }
          : null,
    };
  }

  // The live count, on every step — not only where the constraints are edited.
  // Constraints only: adding the index here would make the number answer a
  // different question from the one the label asks.
  const preview = useQuery({
    queryKey: ["selection-preview", JSON.stringify(rootGroupPayload())],
    queryFn: () => runSelection({ root_group: rootGroupPayload(), index: null, ranking: null }),
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
        root_group: rootGroupPayload(),
        index: activeIndex,
        normalization,
        method,
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
      // `StudyOut` still returns a saved study's constraints as a flat list,
      // even one saved with a real nested `root_group` (Task 8's known gap
      // — the tree is not round-tripped back out). This reproduces exactly
      // the flat shape pre-M6 always had; it never reconstructs nesting.
      setRootGroup({
        ...emptyGroup(nextId(), s.combinator),
        constraints: s.constraints.map((c) => ({
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
      });
      if (s.index) {
        setIndexMode("custom");
        setCustomExpression(s.index.expression);
        setIndexGoal(s.index.goal);
      } else {
        setIndexMode("none");
      }
      setNormalization(s.normalization);
      setMethod(s.method);
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
      // Appended to the root group's own constraints, never nested into a
      // child group the AI has no way to name — same "add, never replace"
      // rule the flat editor always had.
      setRootGroup((current) => ({
        ...current,
        constraints: [
          ...current.constraints,
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
        ],
      }));
    }
    if (accepted.index) {
      setIndexMode(accepted.index.slug);
      setIndexGoal(accepted.index.goal);
    }
  }

  const indexIsCriterion = criteria.some((c) => c.key === "__index__");
  const hasConstraints = countConstraints(rootGroupPayload()) > 0;
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
        // Adding a constraint or a group is now a per-group action inside
        // ConstraintEditor itself (M6) — operator is a per-group property,
        // so "add" has to say which group, which only the editor knows.
        return (
          <Button variant="primary" icon={<IconArrowRight />} onClick={() => setStep("objective")}>
            {t.stepObjective}
          </Button>
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
                <Input
                  label={t.studyName}
                  className="sm:col-span-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label={t.functionText}
                  value={functionText}
                  onChange={(e) => setFunctionText(e.target.value)}
                />
                <Input
                  label={t.objectiveText}
                  value={objectiveText}
                  onChange={(e) => setObjectiveText(e.target.value)}
                />
                <Input
                  label={t.freeVariables}
                  className="sm:col-span-2"
                  value={freeVariables}
                  onChange={(e) => setFreeVariables(e.target.value)}
                />
              </CardBody>
            </Card>
          </Section>
        )}

        {/* Optional assistance, on the step where a problem is described. */}
        {step === "function" && <AIAssistPanel onApply={applySuggestions} />}

        {/* Step 2: constraints */}
        {step === "constraints" && (
          <Section title={t.constraintsTitle} description={t.constraintsHint}>
            {/* The root group's own AND/OR toggle lives inside the editor
                now (M6) — operator is a per-group property, not a
                study-level one, so this section no longer owns a combinator
                picker of its own. */}
            <ConstraintEditor
              root={rootGroup}
              properties={properties.data ?? []}
              classes={classes.data ?? []}
              onChange={setRootGroup}
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
                          <Input
                            label={t.expression}
                            className="w-72"
                            value={customExpression}
                            onChange={(e) => setCustomExpression(e.target.value)}
                            placeholder="modulo_young / densidade"
                          />
                          <Select
                            label={t.goal}
                            className="w-40"
                            value={indexGoal}
                            onChange={(e) => setIndexGoal(e.target.value as Goal)}
                          >
                            <SelectOption value="maximize">{t.maximize}</SelectOption>
                            <SelectOption value="minimize">{t.minimize}</SelectOption>
                          </Select>
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
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-ink-muted">{t.method}</span>
                    <ButtonGroup label={t.method}>
                      <ButtonGroupItem
                        selected={method === "weighted_sum"}
                        label={t.methodWeightedSum}
                        onClick={() => setMethod("weighted_sum")}
                      />
                      <ButtonGroupItem
                        selected={method === "topsis"}
                        label={t.methodTopsis}
                        onClick={() => setMethod("topsis")}
                      />
                      <ButtonGroupItem
                        selected={method === "promethee"}
                        label={t.methodPromethee}
                        onClick={() => setMethod("promethee")}
                      />
                    </ButtonGroup>
                  </div>
                  {/* Normalization only means something for weighted_sum —
                      TOPSIS and PROMETHEE fix their own internally, so
                      showing this as if it still applied would mislead. */}
                  {method === "weighted_sum" && (
                    <Select
                      label={t.normalization}
                      className="w-40"
                      value={normalization}
                      onChange={(e) => setNormalization(e.target.value as NormalizationMethod)}
                    >
                      <SelectOption value="minmax">{t.normMinmax}</SelectOption>
                      <SelectOption value="vector">{t.normVector}</SelectOption>
                    </Select>
                  )}
                </div>
              }
            >
              <Card>
                <CardBody className="space-y-3">
                  {method !== "weighted_sum" && (
                    <p className="text-xs text-ink-muted">{t.methodHint}</p>
                  )}
                  {criteria.map((c, position) => (
                    <fieldset key={c.id} className="flex flex-wrap items-end gap-3">
                      <legend className="sr-only">
                        {t.criterion} {position + 1}
                      </legend>
                      <Select
                        label={t.criterion}
                        className="w-56"
                        value={c.key}
                        onChange={(e) =>
                          setCriteria(
                            criteria.map((x) =>
                              x.id === c.id ? { ...x, key: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <SelectOption value="">{t.selectCriterion}</SelectOption>
                        {activeIndex && (
                          <SelectOption value="__index__">{t.useIndexCriterion}</SelectOption>
                        )}
                        {(properties.data ?? []).map((p) => (
                          <SelectOption key={p.slug} value={p.slug}>
                            {p.name}
                          </SelectOption>
                        ))}
                      </Select>
                      <Select
                        label={t.direction}
                        className="w-52"
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
                        <SelectOption value="">{t.autoDirection}</SelectOption>
                        <SelectOption value="max">{t.dirMax}</SelectOption>
                        <SelectOption value="min">{t.dirMin}</SelectOption>
                      </Select>
                      <Input
                        label={t.weight}
                        className="w-24 tabular-nums"
                        inputMode="decimal"
                        value={c.weight}
                        onChange={(e) =>
                          setCriteria(
                            criteria.map((x) =>
                              x.id === c.id ? { ...x, weight: e.target.value } : x,
                            ),
                          )
                        }
                      />
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

                  {/* AHP derives weights; it never becomes a fourth `method`
                      (Task 2's scope note) — so it only shows up here, next
                      to the weight fields it feeds, and only where
                      "weighted_sum" still reads the weight the same way
                      TOPSIS/PROMETHEE do internally. */}
                  {method === "weighted_sum" && (
                    <div className="space-y-3 border-t border-edge pt-3">
                      <Checkbox
                        label={t.ahp.toggle}
                        hint={t.ahp.toggleHint}
                        checked={useAhp}
                        onChange={(e) => setUseAhp(e.target.checked)}
                      />
                      {useAhp && (
                        <AhpMatrixInput criteria={ahpCriteria} onDerived={applyAhpWeights} />
                      )}
                    </div>
                  )}
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
