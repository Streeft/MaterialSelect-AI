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
  listProcessClasses,
  listProcesses,
  listProperties,
  listStudies,
  runSelection,
  runStudy,
  studyExportUrl,
} from "@/lib/api";
import type {
  Combinator,
  SelectionUniverse,
  CriterionIn,
  Goal,
  IndexIn,
  MethodLiteral,
  NormalizationMethod,
  RunRequest,
  RunResult,
  StageIn,
  StageOut,
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
  PageHeader,
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
  emptyConstraint,
  emptyGroup,
  fromConstraintPayload,
  nextEditorId,
} from "@/components/selection/ConstraintEditor";
import {
  StageList,
  type StageState,
  countStageConstraints,
  emptyLimitStage,
  toStagePayload,
} from "@/components/selection/StageList";
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
const nextId = () => `criterion-${counter++}`;

/**
 * How many candidates are still standing, at every step.
 *
 * It used to be a sentence next to the combinator on the constraints step, so
 * the one number the whole method turns on disappeared the moment the reader
 * moved on. Here it is an element, it is always present, and it says what it is
 * doing while it recounts instead of showing a stale number as if it were fresh.
 */
/**
 * One persisted stage as the editor holds it.
 *
 * A named function with an exhaustive switch, and not the nested ternary this
 * used to be: with three kinds a ternary maps the third to whichever branch is
 * the fallback, so reopening a saved study would quietly turn a process stage
 * into an empty limit stage — and the type checker would be satisfied.
 */
function stageFromPayload(stage: StageOut, combinator: Combinator): StageState {
  const common = {
    id: nextEditorId("stage"),
    label: stage.label ?? "",
    enabled: stage.enabled,
  };
  switch (stage.kind) {
    case "tree":
      return {
        ...common,
        kind: "tree",
        classSlugs: stage.class_slugs,
        includeDescendants: stage.include_descendants,
      };
    case "process":
      return {
        ...common,
        kind: "process",
        processSlugs: stage.process_slugs,
        processClassSlugs: stage.process_class_slugs,
        includeDescendants: stage.include_descendants,
      };
    case "material":
      return {
        ...common,
        kind: "material",
        materialClassSlugs: stage.material_class_slugs,
        includeDescendants: stage.include_descendants,
      };
    case "limit":
      return {
        ...common,
        kind: "limit",
        group: stage.root_group
          ? fromConstraintPayload(stage.root_group)
          : emptyGroup(nextEditorId("group"), combinator),
      };
  }
}

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
  // P0-1: the ordered pipeline. It starts as exactly one limit stage holding
  // the nested AND/OR tree M6 introduced, so a simple study looks and behaves
  // as it always did; adding a stage is what turns it into a pipeline.
  const [stages, setStages] = useState<StageState[]>(() => [emptyLimitStage()]);
  // P0-3: which universe the study returns. Switching it resets the pipeline,
  // because a stage of the other universe is refused by the backend — carrying
  // one across would only produce an error the reader did not ask for.
  const [universe, setUniverse] = useState<SelectionUniverse>("material");

  /**
   * Switching universe starts the pipeline over.
   *
   * Carrying stages across would hand the backend a stage it refuses — the
   * kinds are per-universe by design — so the reader would get an error they
   * did not ask for. Resetting is the honest outcome, and the control says so
   * before it is used.
   */
  function changeUniverse(next: SelectionUniverse) {
    if (next === universe) return;
    setUniverse(next);
    setStages([emptyLimitStage()]);
  }

  const isProcessStudy = universe === "process";

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
  // P0-2: the process universe a process stage picks from. Shared reference
  // data like the taxonomy, so it is cached under its own key and read by every
  // stage in the pipeline.
  const processes = useQuery({ queryKey: ["processes"], queryFn: listProcesses });
  const processClasses = useQuery({
    queryKey: ["process-classes"],
    queryFn: listProcessClasses,
  });
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

  const stagesPayload = (): StageIn[] => stages.map(toStagePayload);

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
      universe,
      stages: stagesPayload(),
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
    queryKey: ["selection-preview", universe, JSON.stringify(stagesPayload())],
    queryFn: () =>
      runSelection({ universe, stages: stagesPayload(), index: null, ranking: null }),
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
        universe,
        stages: stagesPayload(),
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
      setUniverse(s.universe);
      // P0-1 closes M6's read-side gap: `StudyOut.stages` carries each stage's
      // real tree, so reopening a nested study restores its parentheses instead
      // of flattening them. A study whose payload somehow has no stage falls
      // back to the flat list — the pre-M6 shape — rather than opening empty.
      setStages(
        s.stages.length > 0
          ? s.stages.map((stage) => stageFromPayload(stage, s.combinator))
          : [
              {
                id: nextEditorId("stage"),
                kind: "limit",
                label: "",
                enabled: true,
                group: {
                  ...emptyGroup(nextEditorId("group"), s.combinator),
                  constraints: s.constraints.map((c) => ({
                    ...emptyConstraint(nextEditorId("row")),
                    operator: c.operator,
                    property_slug: c.property_slug ?? "",
                    value: c.value?.toString() ?? "",
                    value_min: c.value_min?.toString() ?? "",
                    value_max: c.value_max?.toString() ?? "",
                    unit: c.unit ?? "",
                    class_slugs: c.class_slugs ?? [],
                    text: c.text ?? "",
                  })),
                },
              },
            ],
      );
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
      // Appended to the first limit stage's root group, never nested into a
      // child group — nor into a stage — the AI has no way to name. Same
      // "add, never replace" rule the flat editor always had.
      setStages((current) => {
        const target = current.findIndex((s) => s.kind === "limit");
        // No limit stage to append to — a pipeline of only tree and process
        // stages. Adding one is the honest outcome: dropping the suggestion the
        // reader just accepted would look like the button did nothing.
        if (target === -1) {
          return [
            ...current,
            {
              ...emptyLimitStage(),
              group: {
                ...emptyGroup(nextEditorId("group")),
                constraints: accepted.constraints.map(({ constraint }) => ({
                  ...emptyConstraint(nextEditorId("row")),
                  operator: constraint.operator,
                  property_slug: constraint.property_slug ?? "",
                  value: constraint.value?.toString() ?? "",
                  value_min: constraint.value_min?.toString() ?? "",
                  value_max: constraint.value_max?.toString() ?? "",
                  unit: constraint.unit ?? "",
                  class_slugs: constraint.class_slugs ?? [],
                  text: constraint.text ?? "",
                })),
              },
            },
          ];
        }
        return current.map((stage, i) =>
          i !== target || stage.kind !== "limit"
            ? stage
            : {
                ...stage,
                group: {
                  ...stage.group,
                  constraints: [
                    ...stage.group.constraints,
                    ...accepted.constraints.map(({ constraint }) => ({
                      ...emptyConstraint(nextEditorId("row")),
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
                },
              },
        );
      });
    }
    if (accepted.index) {
      setIndexMode(accepted.index.slug);
      setIndexGoal(accepted.index.goal);
    }
  }

  const indexIsCriterion = criteria.some((c) => c.key === "__index__");
  // A tree or process stage narrows without carrying a constraint, so "has the
  // reader said anything yet" is not the constraint count alone.
  const hasConstraints =
    countStageConstraints(stages) > 0 ||
    stages.some((s) => s.kind === "tree" && s.classSlugs.length > 0) ||
    stages.some(
      (s) =>
        s.kind === "process" &&
        (s.processSlugs.length > 0 || s.processClassSlugs.length > 0),
    );
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
        <PageHeader title={t.title} description={t.subtitle} group="estudar" />

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
          <Section
            title={stages.length > 1 ? t.stagesTitle : t.constraintsTitle}
            description={stages.length > 1 ? t.stagesHint : t.constraintsHint}
          >
            {/* P0-3: the universe comes before the stages because it decides
                which stages exist. Put after them it would read as a filter on
                a pipeline already written. */}
            <Card className="mb-4">
              <CardBody className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-ink-muted">{t.universeTitle}</span>
                  <ButtonGroup label={t.universeTitle}>
                    <ButtonGroupItem
                      selected={universe === "material"}
                      label={t.universeMaterial}
                      onClick={() => changeUniverse("material")}
                    />
                    <ButtonGroupItem
                      selected={universe === "process"}
                      label={t.universeProcess}
                      onClick={() => changeUniverse("process")}
                    />
                  </ButtonGroup>
                </div>
                <p className="text-xs text-fg-muted">{t.universeHint}</p>
                {/* What a process study cannot do, said here rather than
                    discovered as an error two steps later. */}
                {isProcessStudy && <Alert tone="info">{t.universeProcessNote}</Alert>}
              </CardBody>
            </Card>
            {/* The root group's own AND/OR toggle lives inside the editor
                (M6) — operator is a per-group property, not a study-level
                one — and since P0-1 each stage owns one such tree. */}
            <StageList
              stages={stages}
              properties={properties.data ?? []}
              classes={classes.data ?? []}
              processes={processes.data ?? []}
              processClasses={processClasses.data ?? []}
              universe={universe}
              onChange={setStages}
            />
          </Section>
        )}

        {/* Step 3: objective (index + ranking) */}
        {/* P0-3: a process study has no objective step to fill in. Said here,
            in the step the reader opened, rather than discovered as a 400 when
            they press Run. */}
        {step === "objective" && isProcessStudy && (
          <Section title={t.objectiveTitle}>
            <Alert tone="info">{t.universeProcessNote}</Alert>
          </Section>
        )}

        {step === "objective" && !isProcessStudy && (
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
