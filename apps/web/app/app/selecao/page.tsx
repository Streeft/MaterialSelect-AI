"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDebounced } from "@/lib/useDebounced";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createStudy,
  deleteStudy,
  evaluateIndex,
  getStudy,
  listClasses,
  listPerformanceIndices,
  listProcessAttributes,
  listProcessClasses,
  listProcesses,
  listProperties,
  listStudies,
  runSelection,
  runStudy,
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
import { prettyUnit } from "@/lib/format";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  ButtonLink,
  Card,
  CardBody,
  Checkbox,
  Disclosure,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Select,
  SelectOption,
  Stepper,
  type Step as StepItem,
  type StepStatus,
} from "@/components/ui";
import { IconArrowLeft, IconArrowRight, IconPlus, IconTrash } from "@/components/ui/icons";
import {
  emptyConstraint,
  emptyGroup,
  fromConstraintPayload,
  nextEditorId,
} from "@/components/selection/ConstraintEditor";
import {
  StageAddButtons,
  StageList,
  type StageState,
  boundToField,
  chartAxisFromPayload,
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
import { SavedStudiesPanel } from "@/components/selection/SavedStudiesPanel";
import {
  constraintsUseAdvanced,
  functionUsesAdvanced,
  initialLimitStage,
  objectiveUsesAdvanced,
} from "@/lib/selection/advanced";
import { AIAssistPanel, type AcceptedSuggestions } from "@/components/ai/AIAssistPanel";

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

const SLUG_BY_STEP = Object.fromEntries(
  Object.entries(STEP_BY_SLUG).map(([slug, id]) => [id, slug]),
) as Record<Step, string>;

/**
 * Navigation is read off the order of `STEPS`, never written per step (D-85):
 * the previous and next step are neighbours in the list, and Run sits on the
 * last step the reader fills in. Reordering the wizard is then reordering the
 * list — nothing else can drift out of step with it.
 */
const INPUT_STEPS = STEPS.filter((s) => s.id !== "results").map((s) => s.id);
const LAST_INPUT_STEP: Step = INPUT_STEPS[INPUT_STEPS.length - 1] ?? "objective";

function neighbours(step: Step): { prev: Step | null; next: Step | null } {
  const i = STEPS.findIndex((s) => s.id === step);
  return { prev: STEPS[i - 1]?.id ?? null, next: STEPS[i + 1]?.id ?? null };
}

function labelOf(step: Step): string {
  return STEPS.find((s) => s.id === step)?.label ?? step;
}

interface CriterionRow {
  id: string;
  key: string;
  direction: "" | "max" | "min";
  weight: string;
}

let counter = 0;
const nextId = () => `criterion-${counter++}`;

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
    case "chart":
      return {
        ...common,
        kind: "chart",
        // A chart stage always has a plane, but the type says it may be null,
        // and a study whose row somehow lost it reopens as a blank plane rather
        // than crashing the editor.
        x: chartAxisFromPayload(stage.chart?.x),
        y: chartAxisFromPayload(stage.chart?.y),
        indexExpression: stage.chart?.index_expression ?? "",
        indexGoal: stage.chart?.index_goal ?? "maximize",
        indexLevel: boundToField(stage.chart?.index_level),
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
  const [step, setStep] = useState<Step>(() => {
    if (params.get("novo_estagio") === "chart") return "constraints";
    return STEP_BY_SLUG[params.get("etapa") ?? ""] ?? "function";
  });

  /**
   * Move to a step and write it into the URL (D-85), so the browser's Back
   * button goes back one step instead of leaving the tool — what a reader who
   * clicks first and asks later reaches for. `replace` for moves that are not
   * the reader's (landing after a study loads), which should not add history.
   */
  const goToStep = useCallback((next: Step, options?: { replace?: boolean }) => {
    setStep(next);
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    query.delete("novo_estagio");
    query.set("etapa", SLUG_BY_STEP[next]);
    const url = `${window.location.pathname}?${query.toString()}`;
    if (options?.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }, []);

  // Browser Back/Forward: the history entry changed under us, so follow it.
  // `popstate` is what those buttons fire, and only they fire it — our own
  // pushState/replaceState never do — so this cannot echo `goToStep`.
  useEffect(() => {
    const onPop = () => {
      const query = new URLSearchParams(window.location.search);
      setStep(STEP_BY_SLUG[query.get("etapa") ?? ""] ?? "function");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const [name, setName] = useState("");
  const [functionText, setFunctionText] = useState("");
  const [objectiveText, setObjectiveText] = useState("");
  const [freeVariables, setFreeVariables] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  // P0-1: the ordered pipeline. It starts as exactly one limit stage holding
  // the nested AND/OR tree M6 introduced, so a simple study looks and behaves
  // as it always did; adding a stage is what turns it into a pipeline.
  // P1-2: deep link from chart map (/app/mapas) initializes with a chart stage
  const [stages, setStages] = useState<StageState[]>(() => {
    const newStageParam = params.get("novo_estagio");
    if (newStageParam === "chart") {
      const xProp = params.get("x_prop");
      const xExpr = params.get("x_expr");
      const yProp = params.get("y_prop");
      const yExpr = params.get("y_expr");
      const xMin = params.get("x_min") ?? "";
      const xMax = params.get("x_max") ?? "";
      const yMin = params.get("y_min") ?? "";
      const yMax = params.get("y_max") ?? "";

      return [
        {
          id: nextEditorId("stage"),
          kind: "chart",
          label: "",
          enabled: true,
          x: {
            mode: xProp ? "property" : "expression",
            propertySlug: xProp ?? "",
            expression: xExpr ?? "",
            min: xMin,
            max: xMax,
          },
          y: {
            mode: yProp ? "property" : "expression",
            propertySlug: yProp ?? "",
            expression: yExpr ?? "",
            min: yMin,
            max: yMax,
          },
          indexExpression: "",
          indexGoal: "maximize",
          indexLevel: "",
        },
      ];
    }
    return [initialLimitStage()];
  });
  // P0-3: which universe the study returns. Switching it resets the pipeline,
  // because a stage of the other universe is refused by the backend — carrying
  // one across would only produce an error the reader did not ask for.
  const [universe, setUniverse] = useState<SelectionUniverse>(() => {
    return params.get("universo") === "process" ? "process" : "material";
  });
  // D-85: each step's "Opções avançadas". Opened by the screen itself whenever
  // what it would hide is already in use (see lib/selection/advanced.ts).
  const [advFunction, setAdvFunction] = useState(() => functionUsesAdvanced(universe));
  const [advConstraints, setAdvConstraints] = useState(() => constraintsUseAdvanced(stages));
  const [advObjective, setAdvObjective] = useState(false);

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
    setStages([initialLimitStage()]);
    // D-84: the objective names keys of one catalogue — material properties or
    // process attributes — so it cannot cross over either. A property criterion
    // in a process study is refused by the backend by name.
    setCriteria([]);
    setIndexMode("none");
    setCustomExpression("");
    setValidation(null);
    setUseAhp(false);
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
  // P0-4: what a limit stage over processes selects on. Its own query, because
  // it is its own catalogue — a material property picker that could reach "faixa
  // de massa" would be offering a process capability as a material property.
  const processAttributes = useQuery({
    queryKey: ["process-attributes"],
    queryFn: listProcessAttributes,
  });
  const processClasses = useQuery({
    queryKey: ["process-classes"],
    queryFn: listProcessClasses,
  });
  const indices = useQuery({ queryKey: ["performance-indices"], queryFn: listPerformanceIndices });
  const studies = useQuery({ queryKey: ["studies"], queryFn: listStudies });

  const fail = (err: unknown) => setError(err instanceof ApiError ? err.message : t.genericError);

  /**
   * What a ranking criterion may name, in this study's universe (D-84).
   *
   * A process study ranks by process attributes — but only the numeric ones: a
   * discrete attribute is a set of labels with no order, and the backend
   * refuses it by name. Offering it would be offering a 400.
   */
  const criterionOptions = useMemo<{ slug: string; name: string; variable: string }[]>(
    () =>
      isProcessStudy
        ? (processAttributes.data ?? [])
            .filter((a) => a.kind !== "DISCRETO")
            .map((a) => ({ slug: a.slug, name: a.name, variable: a.variable }))
        : (properties.data ?? []).map((p) => ({ slug: p.slug, name: p.name, variable: p.slug })),
    [isProcessStudy, processAttributes.data, properties.data],
  );

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
              : criterionOptions.find((p) => p.slug === c.key)?.name ?? c.key,
        })),
    [criteria, criterionOptions],
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
  // Debounced (D-85): typing "70" used to send "7" and "70" as two full runs.
  // With a class of forty on one small machine that is the difference between a
  // counter that keeps up and one that queues.
  const stagesKey = useDebounced(JSON.stringify(stagesPayload()), 300);
  const preview = useQuery({
    queryKey: ["selection-preview", universe, stagesKey],
    queryFn: () =>
      runSelection({
        universe,
        stages: JSON.parse(stagesKey) as StageIn[],
        index: null,
        ranking: null,
      }),
    // Keep the previous count on screen while the next one is in flight, so the
    // element does not blink between every keystroke.
    placeholderData: (previous) => previous,
  });

  const run = useMutation({
    mutationFn: () => runSelection(buildRequest(true)),
    onSuccess: (data) => {
      setResult(data);
      goToStep("results");
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
      const reopened: StageState[] =
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
            ];
      setStages(reopened);
      setAdvConstraints(constraintsUseAdvanced(reopened));
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
      setAdvFunction(functionUsesAdvanced(s.universe));
      setAdvObjective(
        objectiveUsesAdvanced({ method: s.method, normalization: s.normalization, useAhp: false }),
      );
      // Where Run is: a reopened study is one click from running again, and the
      // step summaries are one click from any part of it.
      goToStep(LAST_INPUT_STEP, { replace: true });
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
      goToStep("results");
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

  // P1-2: deep link from chart map (/app/mapas) cleans URL after mounting
  useEffect(() => {
    if (params.get("novo_estagio") === "chart" && typeof window !== "undefined") {
      // The stage is built; the URL keeps only where the reader is, so a Back
      // from here does not rebuild the chart stage on top of their edits.
      window.history.replaceState(null, "", `${window.location.pathname}?etapa=restricoes`);
    }
  }, [params]);

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
    ) ||
    // A chart stage with both axes chosen narrows even with no box and no line:
    // "must be plottable here" is a criterion, so the step is done.
    stages.some(
      (s) =>
        s.kind === "chart" &&
        [s.x, s.y].every((axis) =>
          axis.mode === "property" ? axis.propertySlug !== "" : axis.expression.trim() !== "",
        ),
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

  /**
   * Back and forward, the same on every step (D-85): "Voltar" always exists —
   * on the first step it leaves for the home page — and the primary button
   * names where it goes ("Próximo: Objetivo"), or runs on the last input step.
   */
  function actionsForStep() {
    if (step === "results") {
      return (
        <>
          <Button
            variant="secondary"
            icon={<IconArrowLeft />}
            onClick={() => goToStep(LAST_INPUT_STEP)}
          >
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
    const { prev, next } = neighbours(step);
    return (
      <>
        {prev ? (
          <Button variant="secondary" icon={<IconArrowLeft />} onClick={() => goToStep(prev)}>
            {t.back}
          </Button>
        ) : (
          <ButtonLink href="/app" variant="secondary" icon={<IconArrowLeft />}>
            {t.backToHome}
          </ButtonLink>
        )}
        {step === LAST_INPUT_STEP || !next ? (
          <Button variant="primary" loading={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? t.running : t.run}
          </Button>
        ) : (
          <Button variant="primary" icon={<IconArrowRight />} onClick={() => goToStep(next)}>
            {t.nextStep(labelOf(next))}
          </Button>
        )}
      </>
    );
  }

  /** What each step already holds, in a few words — the stepper's second line. */
  const stepSummaries: Record<Step, string | undefined> = {
    function: name.trim() || functionText.trim() || undefined,
    objective: hasObjective
      ? t.summaryObjective(activeIndex?.name ?? null, criteriaPayload().length)
      : undefined,
    constraints: hasConstraints
      ? t.summaryConstraints(countStageConstraints(stages), stages.length)
      : undefined,
    results: result ? t.summaryResults(result.final_count) : undefined,
  };
  const stepsWithSummary = STEPS.map((s) => ({ ...s, summary: stepSummaries[s.id] }));

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <PageHeader title={t.title} description={t.subtitle} group="estudar" />

        <SavedStudiesPanel
          studies={studies.data}
          onRun={(id) => runSaved.mutate(id)}
          onLoad={(id) => loadStudy.mutate(id)}
          onDelete={(id) => removeStudy.mutate(id)}
        />

        <Stepper
          label={ptBR.ui.steps}
          steps={stepsWithSummary}
          statusOf={statusOf}
          current={step}
          onSelect={(next) => goToStep(next)}
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
                  hint={t.studyNameHint}
                  className="sm:col-span-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label={t.functionText}
                  hint={t.functionTextHint}
                  value={functionText}
                  onChange={(e) => setFunctionText(e.target.value)}
                />
                <Input
                  label={t.objectiveText}
                  hint={t.objectiveTextHint}
                  value={objectiveText}
                  onChange={(e) => setObjectiveText(e.target.value)}
                />
                <Input
                  label={t.freeVariables}
                  hint={t.freeVariablesHint}
                  className="sm:col-span-2"
                  value={freeVariables}
                  onChange={(e) => setFreeVariables(e.target.value)}
                />
              </CardBody>
            </Card>
            {/* P0-3 put the universe before the stages because it decides which
                stages exist; since D-84 it also decides what the objective
                ranks by, so it belongs to the problem, not to one step. It is
                advanced (D-85): most studies return materials. */}
            <Disclosure
              className="mt-4"
              summary={
                isProcessStudy ? `${ptBR.ui.advancedOptions} · ${t.universeProcess}` : ptBR.ui.advancedOptions
              }
              open={advFunction}
              onOpenChange={setAdvFunction}
            >
              <div className="flex flex-col gap-2">
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
                <p className="text-xs text-fg-muted">{t.universeHint}</p>
                {isProcessStudy && <Alert tone="info">{t.universeProcessNote}</Alert>}
              </div>
            </Disclosure>
          </Section>
        )}

        {/* Optional assistance, on the step where a problem is described —
            behind a button (D-85): a second form open under the first is the
            clutter this redesign removes, and the reader who wants it asks. */}
        {step === "function" && (
          <div className="space-y-3">
            <Button
              variant="secondary"
              aria-expanded={aiOpen}
              aria-controls={aiOpen ? "ai-assist-panel" : undefined}
              onClick={() => setAiOpen((open) => !open)}
            >
              {aiOpen ? t.aiClose : t.aiOpen}
            </Button>
            {aiOpen && (
              <div id="ai-assist-panel">
                <AIAssistPanel onApply={applySuggestions} />
              </div>
            )}
          </div>
        )}

        {/* Step 2: constraints */}
        {step === "constraints" && (
          <Section
            title={stages.length > 1 ? t.stagesTitle : t.constraintsTitle}
            description={stages.length > 1 ? t.stagesHint : t.constraintsHint}
          >
            {/* What a process study cannot do is said where it matters; the
                universe itself is chosen on the first step (D-85). */}
            {isProcessStudy && (
              <Alert tone="info" className="mb-4">
                {t.universeProcessNote}
              </Alert>
            )}
            <StageList
              stages={stages}
              properties={properties.data ?? []}
              processAttributes={processAttributes.data ?? []}
              classes={classes.data ?? []}
              processes={processes.data ?? []}
              processClasses={processClasses.data ?? []}
              universe={universe}
              onChange={setStages}
              showAddButtons={false}
              compactSingleStage={!advConstraints}
              constraintAdvanced={advConstraints}
            />
            <Disclosure
              className="mt-4"
              summary={ptBR.ui.advancedOptions}
              open={advConstraints}
              onOpenChange={setAdvConstraints}
            >
              <div className="flex flex-col gap-3">
                <p className="text-xs text-ink-muted">{t.advancedConstraintsHint}</p>
                <StageAddButtons stages={stages} universe={universe} onChange={setStages} />
              </div>
            </Disclosure>
          </Section>
        )}

        {/* Step 3: objective (index + ranking). D-84: both universes — a
            process study ranks by its numeric attributes since P0-4 (D-59). */}
        {step === "objective" && (
          <div className="space-y-5">
            <Section title={t.objectiveTitle}>
              <Card>
                <CardBody className="space-y-3">
                  {isProcessStudy && (
                    <Alert tone="info">{t.processIndexNote}</Alert>
                  )}
                  <IndexPicker
                    indices={isProcessStudy ? [] : (indices.data ?? [])}
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
                            placeholder={
                              isProcessStudy
                                ? (criterionOptions[0]?.variable ?? "")
                                : "modulo_young / densidade"
                            }
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
                          {/* `/selection/index` evaluates over materials only, so
                              in a process study its sole outcome would be a 400. */}
                          {!isProcessStudy && (
                            <Button
                              onClick={() => validateExpr.mutate()}
                              loading={validateExpr.isPending}
                            >
                              {t.validate}
                            </Button>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-ink-muted">
                          {isProcessStudy ? t.expressionCheckedOnRun : t.expressionHint}{" "}
                          {criterionOptions.length > 0 && (
                            <span className="text-ink-subtle">
                              ({t.variablesAvailable}:{" "}
                              {criterionOptions.map((p) => p.variable).join(", ")})
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

            <Section title={t.rankingTitle} description={t.rankingHint}>
              <Card>
                <CardBody className="space-y-3">
                  {/* A non-default method stays visible with the section closed:
                      the rule is that a collapsed section never hides what is
                      already in use (D-85). */}
                  {!advObjective && method !== "weighted_sum" && (
                    <p className="text-xs text-ink-muted">
                      {t.methodInUse(method === "topsis" ? t.methodTopsis : t.methodPromethee)}
                    </p>
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
                        {criterionOptions.map((p) => (
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

                  <Disclosure
                    summary={ptBR.ui.advancedOptions}
                    open={advObjective}
                    onOpenChange={setAdvObjective}
                  >
                    <div className="flex flex-col gap-4">
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
                          <span className="text-2xs text-ink-subtle">{t.methodFieldHint}</span>
                        </div>
                        {/* Normalization only means something for weighted_sum —
                            TOPSIS and PROMETHEE fix their own internally, so
                            showing this as if it still applied would mislead. */}
                        {method === "weighted_sum" && (
                          <Select
                            label={t.normalization}
                            hint={t.normalizationHint}
                            className="w-56"
                            value={normalization}
                            onChange={(e) =>
                              setNormalization(e.target.value as NormalizationMethod)
                            }
                          >
                            <SelectOption value="minmax">{t.normMinmax}</SelectOption>
                            <SelectOption value="vector">{t.normVector}</SelectOption>
                          </Select>
                        )}
                      </div>
                      {method !== "weighted_sum" && (
                        <p className="text-xs text-ink-muted">{t.methodHint}</p>
                      )}
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
                    </div>
                  </Disclosure>
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
            covered by a floating strip. A card inside the content column, not
            a band bleeding past it: the band's negative margin no longer
            matched the column's padding once that grew with the screen. */}
        <div className="sticky bottom-3 z-20 rounded-card border border-edge bg-surface-raised/95 px-4 py-3 shadow-overlay backdrop-blur">
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

    </div>
  );
}
