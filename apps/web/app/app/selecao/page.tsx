"use client";

import { describeApiError } from "@/lib/errors";
import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDebounced } from "@/lib/useDebounced";
import { useUndoableDelete, withoutId } from "@/lib/useUndoableDelete";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/auth";
import {
  type Draft,
  type DraftData,
  clearDraft,
  draftKey,
  maxIdSuffix,
  readDraft,
  serializeDraft,
  writeDraft,
} from "@/lib/selectionDraft";
import {
  createStudy,
  deleteStudy,
  evaluateIndex,
  getStudy,
  listClasses,
  listPerformanceIndices,
  listOrdinalProperties,
  listProcessAttributes,
  listProcessClasses,
  listProcesses,
  listProperties,
  listStudies,
  listStudyTemplates,
  previewFunnel,
  previewWeights,
  runSelection,
  runStudy,
} from "@/lib/api";
import type {
  CriterionIn,
  FunnelPreviewRequest,
  IndexIn,
  RunRequest,
  RunResult,
  StageIn,
  StudyDetail,
  StudyTemplate,
  WeightsPreviewRequest,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { wizardText } from "@/lib/i18n-selection-wizard";
import { dimensionName } from "@/lib/format";
import {
  Alert,
  Button,
  ButtonLink,
  LoadingState,
  MenuItem,
  PageHeader,
  SplitButton,
  Stepper,
  type Step as StepItem,
  type StepStatus,
} from "@/components/ui";
import { useAnnounce } from "@/components/ui/Announcer";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/icons";
import { reserveEditorIds } from "@/components/selection/ConstraintEditor";
import { countStageConstraints, toStagePayload } from "@/components/selection/StageList";
import { describeCustomIndex, describeIndex, type IndexDescriptor } from "@/components/selection/IndexCard";
import { LiveFunnel } from "@/components/selection/LiveFunnel";
import { SavedStudiesPanel } from "@/components/selection/SavedStudiesPanel";
import { TemplatePicker } from "@/components/selection/TemplatePicker";
import { BIKE_BEAM_EXAMPLE, missingForExample } from "@/lib/selection/examples";
import { parseWeightInput, weightsGate } from "@/lib/selection/weightsGate";
import { functionFromParams } from "@/lib/selection/functionParam";
import {
  LAST_INPUT_STEP,
  SLUG_BY_STEP,
  STEPS,
  focusField,
  labelOf,
  neighbours,
  stepFromSlug,
  type Step,
} from "./steps/steps";
import { CandidateCounter, StepPanes } from "./steps/chrome";
import { FunctionStep } from "./steps/FunctionStep";
import { ObjectiveStep, type CriterionOption } from "./steps/ObjectiveStep";
import { ConstraintsStep } from "./steps/ConstraintsStep";
import { ResultsStep } from "./steps/ResultsStep";
import { WizardProgress, type ProgressItem } from "./steps/WizardProgress";
import { runBlockers, type RunBlocker } from "./runReadiness";
import {
  initialWizardState,
  reserveCriterionIds,
  snapshotOf,
  stateFromExample,
  stateFromStudy,
  stateFromTemplate,
  wizardReducer,
  type WizardSnapshot,
} from "./wizardState";

const t = ptBR.selection;
const w = wizardText;

export default function SelectionPage() {
  // `useSearchParams` opts the subtree out of prerendering unless it sits
  // behind a boundary; without this, `next build` refuses the page.
  return (
    <Suspense fallback={<LoadingState />}>
      <SelectionWizard />
    </Suspense>
  );
}

/** The runs of the study being edited: the last two, for the comparison (D-210). */
interface Runs {
  current: RunResult | null;
  previous: RunResult | null;
  /** Grows with every run, so a comparison is asked once per pair. */
  key: number;
}

/** What the example or a template replaced, for its one-click "Desfazer". */
interface LoadNotice {
  text: string;
  tone: "success" | "warning";
  undo: WizardSnapshot | null;
  /** Templates offer the way to their limits; the example does not need it. */
  showLimits: boolean;
}

/**
 * The selection wizard (D-210): the orchestration only — the URL step, the
 * server data, the runs and the draft. The study itself is one reducer
 * (`wizardState.ts`) and each step is its own component under `steps/`.
 */
function SelectionWizard() {
  const qc = useQueryClient();
  const params = useSearchParams();
  // D-139: the draft is kept per account (a shared machine must not mix students).
  const me = useCurrentUser();
  const draftUserKey = me.data ? draftKey(me.data.id) : null;
  const [draftState, setDraftState] = useState<"idle" | "saved">("idle");
  const announce = useAnnounce();
  const stepTitleRef = useRef<HTMLHeadingElement>(null);
  const focusStepTitle = useRef(false);
  /** D-210: a field "Ir ao campo" asked for, focused once its step is drawn. */
  const [fieldRequest, setFieldRequest] = useState<{ id: string; n: number } | null>(null);
  const [step, setStep] = useState<Step>(() => {
    if (params.get("novo_estagio") === "chart") return "constraints";
    return stepFromSlug(params.get("etapa")) ?? "function";
  });

  /**
   * Move to a step and write it into the URL (D-85), so the browser's Back
   * button goes back one step instead of leaving the tool. `replace` for moves
   * that are not the reader's (landing after a study loads), which should not
   * add history.
   */
  const goToStep = useCallback((next: Step, options?: { replace?: boolean }) => {
    // D-146: a step the reader chose takes focus to its title; one the screen
    // chose for them (a study loading) does not pull focus away.
    if (!options?.replace) focusStepTitle.current = true;
    setStep(next);
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    query.delete("novo_estagio");
    query.set("etapa", SLUG_BY_STEP[next]);
    const url = `${window.location.pathname}?${query.toString()}`;
    if (options?.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }, []);

  useEffect(() => {
    if (!focusStepTitle.current) return;
    focusStepTitle.current = false;
    stepTitleRef.current?.focus();
  }, [step]);

  // After the step's title: a field the reader asked to be taken to wins.
  useEffect(() => {
    if (!fieldRequest) return;
    focusField(fieldRequest.id);
  }, [fieldRequest, step]);

  // Browser Back/Forward: the history entry changed under us, so follow it.
  // `popstate` is what those buttons fire, and only they fire it — our own
  // pushState/replaceState never do — so this cannot echo `goToStep`.
  useEffect(() => {
    const onPop = () => {
      const query = new URLSearchParams(window.location.search);
      setStep(stepFromSlug(query.get("etapa")) ?? "function");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // D-195: the home's composer opens the wizard with what the part must do
  // already written (`?funcao=`). Text only: nothing in it becomes a number.
  const [state, dispatch] = useReducer(wizardReducer, params, (p) =>
    initialWizardState(p, functionFromParams(p)),
  );
  const isProcessStudy = state.universe === "process";

  const [runs, setRuns] = useState<Runs>({ current: null, previous: null, key: 0 });
  const result = runs.current;
  /** A different study is on screen: its runs are not comparable with the last one's. */
  const forgetRuns = () => setRuns((r) => ({ current: null, previous: null, key: r.key + 1 }));
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<LoadNotice | null>(null);

  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  // P0-2: the process universe a process stage picks from. Shared reference data.
  const processes = useQuery({ queryKey: ["processes"], queryFn: listProcesses });
  // P0-4: what a limit stage over processes selects on — its own catalogue.
  const processAttributes = useQuery({
    queryKey: ["process-attributes"],
    queryFn: listProcessAttributes,
  });
  // D-126: ordinal material properties, for the minimum-level criterion. A
  // failed or slow load only hides that criterion; nothing else waits on it.
  const ordinalProperties = useQuery({
    queryKey: ["ordinal-properties"],
    queryFn: listOrdinalProperties,
  });
  const processClasses = useQuery({
    queryKey: ["process-classes"],
    queryFn: listProcessClasses,
  });
  const indices = useQuery({ queryKey: ["performance-indices"], queryFn: listPerformanceIndices });
  const studies = useQuery({ queryKey: ["studies"], queryFn: listStudies });
  // D-210: the ready-made studies, defined in the backend.
  const templates = useQuery({
    queryKey: ["selection-templates"],
    queryFn: listStudyTemplates,
    staleTime: Infinity,
  });

  const fail = (err: unknown) => setError(describeApiError(err, t.genericError));

  /**
   * What a ranking criterion may name, in this study's universe (D-84): a
   * process study ranks by its numeric attributes only — a discrete attribute
   * has no order, and the backend refuses it by name.
   */
  const criterionOptions = useMemo<CriterionOption[]>(
    () =>
      isProcessStudy
        ? (processAttributes.data ?? [])
            .filter((a) => a.kind !== "DISCRETO")
            .map((a) => ({ slug: a.slug, name: a.name, variable: a.variable }))
        : (properties.data ?? []).map((p) => ({ slug: p.slug, name: p.name, variable: p.slug })),
    [isProcessStudy, processAttributes.data, properties.data],
  );

  const { indexMode, customExpression, indexGoal, criteria, stages } = state;

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

  // Same resolution, keeping what the reader needs and the run does not: the
  // declared assumptions and the dimension of the result.
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
      universe: state.universe,
      stages: stagesPayload(),
      index: includeObjective ? activeIndex : null,
      ranking:
        includeObjective && criteriaPayload().length > 0
          ? {
              normalization: state.normalization,
              method: state.method,
              criteria: criteriaPayload(),
              run_sensitivity: true,
            }
          : null,
    };
  }

  // The live funnel, on every input step (D-186, D-210): the counts of the
  // constraints alone, from `POST /selection/funnel` — no candidate list.
  // Debounced (D-85) on the serialized request, never the object: typing "70"
  // must not send "7" and "70" as two requests.
  const funnelKey = useDebounced(
    JSON.stringify({ universe: state.universe, stages: stagesPayload() }),
    300,
  );
  const preview = useQuery({
    queryKey: ["selection-funnel", funnelKey],
    queryFn: () => previewFunnel(JSON.parse(funnelKey) as FunnelPreviewRequest),
    // Keep the previous count on screen while the next one is in flight, so the
    // element does not blink between every keystroke.
    placeholderData: (previous) => previous,
  });

  // D-87: the weight budget and the top five, computed in the backend while
  // the reader types. Debounced on the serialized key, never the object.
  const weightsRequest: WeightsPreviewRequest = {
    universe: state.universe,
    stages: stagesPayload(),
    index: activeIndex,
    method: state.method,
    normalization: state.normalization,
    criteria: criteria.map((c) => {
      const parsed = parseWeightInput(c.weight);
      return {
        key: c.key,
        direction: c.direction || null,
        weight: typeof parsed === "number" ? parsed : null,
      };
    }),
  };
  const weightsKeyNow = JSON.stringify(weightsRequest);
  const weightsKey = useDebounced(weightsKeyNow, 300);
  const weightsPreview = useQuery({
    queryKey: ["weights-preview", weightsKey],
    queryFn: () => previewWeights(JSON.parse(weightsKey) as WeightsPreviewRequest),
    enabled: criteria.length > 0,
    placeholderData: (previous) => previous,
    retry: false,
  });
  const weightsPending =
    criteria.length > 0 &&
    (weightsKeyNow !== weightsKey ||
      weightsPreview.isPlaceholderData ||
      (!weightsPreview.data && !weightsPreview.isError));
  const gate = weightsGate({
    criteriaCount: criteria.length,
    pending: weightsPending,
    failed: weightsPreview.isError && !weightsPending,
    budget: weightsPreview.data?.budget ?? null,
  });
  // D-210: everything that keeps Run disabled, each with the field that fixes it.
  const blockers = runBlockers({
    indexMode,
    customExpression,
    gate,
    budget: weightsPreview.data?.budget ?? null,
    criteria,
  });
  const canRun = blockers.length === 0;

  function goToField(blocker: RunBlocker) {
    const target = blocker.target;
    if (!target) return;
    // The index block folds once confirmed, and the criteria are locked until
    // it is: open whichever the field lives in.
    if (target.step === "objective") {
      dispatch({ type: "indexConfirmed", confirmed: !blocker.opensIndex });
    }
    if (target.step !== step) goToStep(target.step);
    setFieldRequest((r) => ({ id: target.fieldId, n: (r?.n ?? 0) + 1 }));
  }

  // D-210 (after Linear's ⌘/Ctrl + Enter to submit): run from anywhere on the
  // step that holds Run — a field included, since the chord cannot be typing.
  const runShortcut = useRef<() => void>(() => undefined);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      runShortcut.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const announceRun = (data: RunResult) =>
    announce(data.ranking ? t.announceRanked(data.ranking.ranked.length) : t.announceReady);

  // D-186: `false` is the split button's "Executar só os limites" — who passes,
  // without the index or the ranking.
  const run = useMutation({
    mutationFn: (withObjective: boolean) => runSelection(buildRequest(withObjective)),
    onSuccess: (data) => {
      // D-210: the run before this one stays, for "Execução anterior × atual".
      setRuns((r) => ({ current: data, previous: r.current, key: r.key + 1 }));
      goToStep("results");
      setError(null);
      announceRun(data);
    },
    onError: fail,
  });

  runShortcut.current = () => {
    const onRunStep = step === LAST_INPUT_STEP || (step === "results" && result === null);
    if (onRunStep && canRun && !run.isPending) run.mutate(true);
  };

  const save = useMutation({
    mutationFn: () =>
      createStudy({
        name: state.name.trim(),
        description: null,
        function_text: state.functionText.trim() || null,
        objective_text: state.objectiveText.trim() || null,
        free_variables: state.freeVariables
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        universe: state.universe,
        stages: stagesPayload(),
        index: activeIndex,
        normalization: state.normalization,
        method: state.method,
        criteria: criteriaPayload(),
        notes: state.studyNotes.trim() || null,
      }),
    onSuccess: () => {
      setSaveMessage(t.saved);
      qc.invalidateQueries({ queryKey: ["studies"] });
      // The study is on the server now; the draft has nothing left to protect.
      if (draftUserKey) clearDraft(draftUserKey);
      setDraftBaseline(currentSerialized);
      setDraftState("idle");
    },
    onError: fail,
  });

  const validateExpr = useMutation({
    mutationFn: () => evaluateIndex(customExpression.trim(), indexGoal),
    onSuccess: (res) =>
      dispatch({
        type: "validation",
        message: `${t.validationOk} ${t.dimension}: ${dimensionName(res.dimension)}`,
      }),
    onError: (err) => dispatch({ type: "validation", message: describeApiError(err, t.genericError) }),
  });

  const loadStudy = useMutation({
    mutationFn: (id: number) => getStudy(id),
    onSuccess: (s: StudyDetail) => {
      dispatch({ type: "replace", state: stateFromStudy(state, s) });
      forgetRuns();
      // Where Run is: a reopened study is one click from running again, and the
      // step summaries are one click from any part of it.
      goToStep(LAST_INPUT_STEP, { replace: true });
    },
    onError: fail,
  });

  // D-130: the study leaves the list at once and the API is called only when
  // "Desfazer" times out — the server still has it until then.
  const undoableDelete = useUndoableDelete();
  const removeStudy = (id: number) =>
    undoableDelete({
      what: ptBR.snackbar.study,
      hide: [{ queryKey: ["studies"], remove: withoutId(id) }],
      commit: () => deleteStudy(id),
    });

  const runSaved = useMutation({
    mutationFn: (id: number) => runStudy(id),
    onSuccess: (data) => {
      // A saved study run from the list is not the one being edited.
      setRuns((r) => ({ current: data, previous: null, key: r.key + 1 }));
      goToStep("results");
      announceRun(data);
    },
    onError: fail,
  });

  // `?estudo=<id>` is where the home page's "Retomar" lands. Once, on arrival:
  // re-loading on every render would overwrite whatever the reader typed since.
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

  // D-85: the example, and the way back from it. A snapshot rather than a
  // confirm dialog: loading is one click and undoing is one click.
  function applyExample() {
    const example = BIKE_BEAM_EXAMPLE;
    const missing = missingForExample(example, {
      indexSlugs: (indices.data ?? []).map((i) => i.slug),
      propertySlugs: (properties.data ?? []).map((p) => p.slug),
    });
    if (missing.length > 0) {
      // Half an example teaches the wrong thing; say what is missing instead.
      setNotice({ text: t.exampleUnavailable(missing.join(", ")), tone: "warning", undo: null, showLimits: false });
      return;
    }
    const before = snapshotOf(state);
    dispatch({ type: "replace", state: stateFromExample(state, example) });
    forgetRuns();
    setNotice({ text: t.exampleLoaded, tone: "success", undo: before, showLimits: false });
  }

  // D-210: a ready-made study, with the same one-click way back.
  function applyTemplate(template: StudyTemplate) {
    const before = snapshotOf(state);
    dispatch({
      type: "replace",
      state: stateFromTemplate(state, template, (indices.data ?? []).map((i) => i.slug)),
    });
    forgetRuns();
    setNotice({ text: w.templates.applied(template.name), tone: "success", undo: before, showLimits: true });
    announce(w.templates.applied(template.name));
  }

  function undoNotice() {
    if (notice?.undo) dispatch({ type: "restore", snapshot: notice.undo });
    setNotice(null);
  }

  // D-139: the saved draft. Debounce the SERIALIZED state, never the object (a new
  // object every render would be a new write every render). A pristine wizard is
  // never written; nothing is written while a recovered draft is waiting for an
  // answer or while a saved study is being edited (that has its own save).
  const currentSerialized = JSON.stringify(snapshotOf(state));
  // What the wizard opened with (and, after a save, what the server now holds).
  const [draftBaseline, setDraftBaseline] = useState(currentSerialized);
  const [draftAnswered, setDraftAnswered] = useState(false);
  const stored = useMemo(
    () => (draftUserKey && !requestedStudy ? readDraft(draftUserKey) : null),
    [draftUserKey, requestedStudy],
  );
  const recovered: Draft | null = draftAnswered ? null : stored;
  const dirty = currentSerialized !== draftBaseline;
  const draftBlocked = recovered !== null || Boolean(requestedStudy);
  const pendingDraft = useRef<{ key: string; text: string } | null>(null);

  useEffect(() => {
    if (!draftUserKey || draftBlocked || !dirty) {
      pendingDraft.current = null;
      return;
    }
    const text = serializeDraft(step, JSON.parse(currentSerialized) as DraftData);
    pendingDraft.current = { key: draftUserKey, text };
    const timer = window.setTimeout(() => {
      if (writeDraft(draftUserKey, text)) {
        pendingDraft.current = null;
        setDraftState("saved");
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [currentSerialized, step, draftUserKey, draftBlocked, dirty]);

  // Closing the tab inside the debounce window must not lose the last keystrokes.
  useEffect(() => {
    const flush = () => {
      const pending = pendingDraft.current;
      if (pending && writeDraft(pending.key, pending.text)) pendingDraft.current = null;
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  function continueDraft() {
    if (!recovered) return;
    const highest = maxIdSuffix(JSON.stringify(recovered.data));
    reserveCriterionIds(highest);
    reserveEditorIds(highest);
    dispatch({ type: "restore", snapshot: recovered.data as unknown as WizardSnapshot });
    forgetRuns();
    const wanted = STEPS.find((s) => s.id === recovered.step)?.id ?? "function";
    goToStep(wanted, { replace: true });
    setDraftAnswered(true);
    setDraftState("saved");
  }

  function discardDraft() {
    if (draftUserKey) clearDraft(draftUserKey);
    setDraftAnswered(true);
  }

  // A tree or process stage narrows without carrying a constraint, so "has the
  // reader said anything yet" is not the constraint count alone.
  const hasConstraints =
    countStageConstraints(stages) > 0 ||
    stages.some((s) => s.kind === "tree" && s.classSlugs.length > 0) ||
    stages.some(
      (s) => s.kind === "process" && (s.processSlugs.length > 0 || s.processClassSlugs.length > 0),
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
  const canSave = state.name.trim().length > 0;

  /**
   * Whether a step produced something the run will use. "Done" is not
   * "visited"; Results is the only step that can be blocked, because it is the
   * only one whose content the reader cannot create by typing.
   */
  function isDone(id: Step): boolean {
    switch (id) {
      case "function":
        return Boolean(state.name.trim() || state.functionText.trim());
      case "constraints":
        return hasConstraints;
      case "objective":
        return hasObjective && canRun;
      case "results":
        return result !== null;
    }
  }

  function statusOf(item: StepItem<Step>): StepStatus {
    if (item.id === step) return "current";
    if (item.id === "results") return result ? "done" : "blocked";
    return isDone(item.id) ? "done" : "upcoming";
  }

  const progressItems: ProgressItem[] = STEPS.filter((s) => s.id !== "results").map((s) => ({
    id: s.id,
    label: s.label,
    done: isDone(s.id),
  }));

  /** Why Run is disabled, and the way to each field that fixes it (D-86, D-210). */
  function blockerNotes() {
    if (blockers.length === 0) {
      return gate.note ? (
        <p className="basis-full text-right text-support text-ink-muted sm:basis-auto">{gate.note}</p>
      ) : (
        <span className="hidden text-2xs text-ink-muted lg:inline">{w.shortcut.run}</span>
      );
    }
    return (
      <>
        <p id="executar-motivo" className="basis-full text-right text-support text-ink-muted sm:basis-auto">
          {blockers.map((b) => b.reason).join(" · ")}
        </p>
        {blockers.map((b) =>
          b.action && b.target ? (
            <Button key={b.id} variant="secondary" onClick={() => goToField(b)}>
              {b.action}
            </Button>
          ) : null,
        )}
      </>
    );
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
            className="max-sm:px-3"
            onClick={() => goToStep(LAST_INPUT_STEP)}
          >
            <span className="max-sm:sr-only">{t.back}</span>
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
          <Button
            variant="secondary"
            icon={<IconArrowLeft />}
            className="max-sm:px-3"
            onClick={() => goToStep(prev)}
          >
            <span className="max-sm:sr-only">{t.back}</span>
          </Button>
        ) : (
          <ButtonLink href="/app" variant="secondary" icon={<IconArrowLeft />} className="max-sm:px-3">
            <span className="max-sm:sr-only">{t.backToHome}</span>
          </ButtonLink>
        )}
        {step === LAST_INPUT_STEP || !next ? (
          <>
            {blockerNotes()}
            {hasObjective ? (
              // D-186: the M3 split button. The constraints-only run ignores the
              // weights, so its seat stays open while the weights block the main one.
              <SplitButton
                variant="primary"
                loading={run.isPending}
                disabled={!canRun}
                menuDisabled={run.isPending}
                describedBy={canRun ? undefined : "executar-motivo"}
                onClick={() => run.mutate(true)}
                menuLabel={t.runMenu}
                menu={
                  <MenuItem onSelect={() => run.mutate(false)} hint={t.runLimitsOnlyHint}>
                    {t.runLimitsOnly}
                  </MenuItem>
                }
              >
                {run.isPending ? t.running : t.run}
              </SplitButton>
            ) : (
              <Button
                variant="primary"
                loading={run.isPending}
                disabled={!canRun}
                aria-describedby={canRun ? undefined : "executar-motivo"}
                onClick={() => run.mutate(true)}
              >
                {run.isPending ? t.running : t.run}
              </Button>
            )}
          </>
        ) : (
          <>
            {/* D-88: Objetivo comes before Restrições, so the weights are
                warned about here but never block moving on — the Run button,
                on the last input step, is what waits for them. */}
            {step === "objective" && gate.reason && gate.reason !== t.weights.checking ? (
              <p className="basis-full text-right text-support text-ink-muted sm:basis-auto">
                {t.weights.notBlocking(gate.reason)}
              </p>
            ) : null}
            <Button variant="primary" icon={<IconArrowRight />} onClick={() => goToStep(next)}>
              {/* D-91: one word on a phone, so the bar stays one line; the
                  full "Próximo: Objetivo" is still the button's name. */}
              <span aria-hidden className="sm:hidden">
                {t.nextShort}
              </span>
              <span className="max-sm:sr-only">{t.nextStep(labelOf(next))}</span>
            </Button>
          </>
        )}
      </>
    );
  }

  /** What each step already holds, in a few words — the stepper's second line. */
  const stepSummaries: Record<Step, string | undefined> = {
    function: state.name.trim() || state.functionText.trim() || undefined,
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
        <PageHeader title={t.title} description={t.subtitle} />

        {recovered && (
          <Alert tone="info" role="status">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {t.draftFound(
                  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
                    new Date(recovered.savedAt),
                  ),
                )}
              </span>
              <Button size="sm" variant="secondary" onClick={continueDraft}>
                {t.draftContinue}
              </Button>
              <Button size="sm" variant="ghost" onClick={discardDraft}>
                {t.draftDiscard}
              </Button>
            </div>
          </Alert>
        )}
        {draftState === "saved" && !recovered && (
          <p role="status" className="text-caption text-ink-muted">
            {t.draftSaved}
          </p>
        )}

        <SavedStudiesPanel
          studies={studies.data}
          onRun={(id) => runSaved.mutate(id)}
          onLoad={(id) => loadStudy.mutate(id)}
          onDelete={removeStudy}
        />

        <WizardProgress
          items={progressItems}
          current={step}
          runStep={LAST_INPUT_STEP}
          onSelect={(next) => goToStep(next)}
        />

        <Stepper
          label={ptBR.ui.steps}
          steps={stepsWithSummary}
          statusOf={statusOf}
          current={step}
          onSelect={(next) => goToStep(next)}
        />

        <StepPanes
          withFunnel={step !== "results"}
          funnel={
            <LiveFunnel result={preview.data} pending={preview.isFetching} failed={preview.isError} />
          }
        >
          {error && (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          )}

          <h2 ref={stepTitleRef} tabIndex={-1} className="sr-only">
            {t.stepTitle(STEPS.findIndex((s) => s.id === step) + 1, STEPS.length, labelOf(step))}
          </h2>

          {notice && (
            <Alert tone={notice.undo ? notice.tone : "warning"} role="status">
              <div className="flex flex-wrap items-center gap-3">
                <span>{notice.text}</span>
                {notice.showLimits && step !== "constraints" && (
                  <Button size="sm" variant="secondary" onClick={() => goToStep("constraints")}>
                    {w.templates.goToConstraints}
                  </Button>
                )}
                {notice.undo && (
                  <Button size="sm" variant="secondary" onClick={undoNotice}>
                    {t.exampleUndo}
                  </Button>
                )}
              </div>
            </Alert>
          )}

          {step === "function" && (
            <FunctionStep
              state={state}
              dispatch={dispatch}
              onExample={applyExample}
              templates={
                <TemplatePicker
                  templates={templates.data}
                  loading={templates.isPending}
                  failed={templates.isError}
                  onApply={applyTemplate}
                />
              }
            />
          )}

          {step === "constraints" && (
            <ConstraintsStep
              state={state}
              dispatch={dispatch}
              catalogue={{
                properties: properties.data ?? [],
                processAttributes: processAttributes.data ?? [],
                ordinalProperties: ordinalProperties.data ?? [],
                ordinalFailed: ordinalProperties.isError,
                classes: classes.data ?? [],
                processes: processes.data ?? [],
                processClasses: processClasses.data ?? [],
              }}
            />
          )}

          {/* D-84: both universes — a process study ranks by its numeric
              attributes since P0-4 (D-59). */}
          {step === "objective" && (
            <ObjectiveStep
              state={state}
              dispatch={dispatch}
              indices={indices.data ?? []}
              criterionOptions={criterionOptions}
              activeIndex={activeIndex}
              indexDescriptor={indexDescriptor}
              onValidate={() => validateExpr.mutate()}
              validating={validateExpr.isPending}
              weights={{
                preview: weightsPreview.data ?? null,
                pending: weightsPending,
                failed: weightsPreview.isError && !weightsPending,
              }}
            />
          )}

          {step === "results" && (
            <ResultsStep
              result={result}
              previous={
                runs.previous && result && runs.previous.universe === result.universe
                  ? runs.previous
                  : null
              }
              runKey={runs.key}
              canRun={canRun}
              offerRun={hasObjective || canRun}
              running={run.isPending}
              onRun={() => run.mutate(true)}
              onGoToLimits={() => goToStep(LAST_INPUT_STEP)}
            />
          )}
        </StepPanes>

        {saveMessage && (
          <Alert tone="success" role="status">
            {saveMessage}
          </Alert>
        )}

        {/* The action bar. Sticky rather than fixed: pinned to the bottom of the
            viewport while the wizard is on screen, and out of the way when the
            reader reaches the footer. D-91: above the phone's bottom nav while
            it shows (`--bottom-nav-offset`, set by BottomNav). */}
        <div className="sticky bottom-[calc(var(--bottom-nav-offset,0px)+0.5rem)] z-20 rounded-card border border-line bg-panel/95 px-3 py-2 shadow-overlay backdrop-blur transition-[bottom] duration-slow ease-emphasized sm:px-4 sm:py-3 lg:bottom-3">
          <div
            role="group"
            aria-label={t.actionBar}
            className="flex flex-wrap items-center justify-between gap-2 sm:gap-3"
          >
            <CandidateCounter
              count={preview.data?.final_count ?? null}
              total={preview.data?.initial_count ?? null}
              pending={preview.isFetching}
              failed={preview.isError}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
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
