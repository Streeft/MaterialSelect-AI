/**
 * The selection wizard's study, in one reducer (D-210).
 *
 * Thirty-odd `useState`s used to live in one 1.900-line component, and every
 * multi-field change (loading a study, the example, a draft, a universe
 * switch) had to remember every setter by hand. Here a change is one action,
 * and what it does to the whole study is written once — and tested without
 * rendering anything (`wizardState.test.ts`).
 *
 * What is NOT here: the step (it lives in the URL, D-85), server data (React
 * Query) and run results (they are answers, not the study).
 */
import type {
  ConstraintGroupIn,
  Combinator,
  ConstraintIn,
  Goal,
  MethodLiteral,
  NormalizationMethod,
  SelectionUniverse,
  PlanComponent,
  StageOut,
  StudyDetail,
  StudyTemplate,
} from "@/lib/types";
import {
  type ConstraintRow,
  emptyConstraint,
  emptyGroup,
  fromConstraintPayload,
  nextEditorId,
} from "@/components/selection/ConstraintEditor";
import {
  boundToField,
  chartAxisFromPayload,
  emptyLimitStage,
  type StageState,
} from "@/components/selection/StageList";
import {
  constraintsUseAdvanced,
  functionUsesAdvanced,
  initialLimitStage,
  objectiveUsesAdvanced,
} from "@/lib/selection/advanced";
import type { SelectionExample } from "@/lib/selection/examples";
import { appliedConstraints, studyDetailFromPlan } from "@/lib/ai/plan";

export interface CriterionRow {
  id: string;
  key: string;
  direction: "" | "max" | "min";
  weight: string;
}

let counter = 0;
export const nextCriterionId = () => `criterion-${counter++}`;

/** D-139: a recovered draft carries criterion ids from an earlier load; skip past them. */
export function reserveCriterionIds(highest: number): void {
  counter = Math.max(counter, highest + 1);
}

/**
 * The part of the study a snapshot (undo, draft) carries. Its fields are the
 * draft's (`lib/selectionDraft.ts`, D-139) — changing them changes the draft
 * format, so they stay exactly as they were.
 */
export interface WizardSnapshot {
  name: string;
  functionText: string;
  objectiveText: string;
  freeVariables: string;
  universe: SelectionUniverse;
  stages: StageState[];
  /** "none" | a catalogue index slug | "custom". */
  indexMode: string;
  customExpression: string;
  indexGoal: Goal;
  indexConfirmed: boolean;
  criteria: CriterionRow[];
  method: MethodLiteral;
  normalization: NormalizationMethod;
  useAhp: boolean;
}

export interface WizardState extends WizardSnapshot {
  studyNotes: string;
  /** What the last "Validar" of a custom index said; cleared when it changes. */
  validation: string | null;
  advFunction: boolean;
  advConstraints: boolean;
  advObjective: boolean;
  aiOpen: boolean;
}

export type TextField = "name" | "functionText" | "objectiveText" | "freeVariables" | "studyNotes";
export type AdvancedSection = "function" | "constraints" | "objective";
type Updater<T> = T | ((current: T) => T);

export type WizardAction =
  | { type: "text"; field: TextField; value: string }
  | { type: "stages"; stages: Updater<StageState[]> }
  | { type: "criteria"; criteria: Updater<CriterionRow[]> }
  | { type: "universe"; universe: SelectionUniverse }
  | { type: "indexMode"; mode: string }
  | { type: "customExpression"; expression: string }
  | { type: "indexGoal"; goal: Goal }
  | { type: "indexConfirmed"; confirmed: boolean }
  | { type: "validation"; message: string | null }
  | { type: "method"; method: MethodLiteral }
  | { type: "normalization"; normalization: NormalizationMethod }
  | { type: "useAhp"; value: boolean }
  | { type: "advanced"; section: AdvancedSection; open: boolean }
  | { type: "toggleAi" }
  | { type: "restore"; snapshot: WizardSnapshot }
  | { type: "replace"; state: WizardState }
  /** D-225: the assistant's proposal for one part, applied after the person's review. */
  | { type: "plan"; component: PlanComponent };

function resolve<T>(update: Updater<T>, current: T): T {
  return typeof update === "function" ? (update as (c: T) => T)(current) : update;
}

/** The study the wizard opens with. Deep links (`?novo_estagio=chart`, `?universo=`) seed it. */
export function initialWizardState(params: {
  get(name: string): string | null;
}, functionText = ""): WizardState {
  const universe: SelectionUniverse = params.get("universo") === "process" ? "process" : "material";
  const stages = initialStages(params);
  return {
    name: "",
    functionText,
    objectiveText: "",
    freeVariables: "",
    studyNotes: "",
    universe,
    stages,
    indexMode: "none",
    customExpression: "",
    indexGoal: "maximize",
    indexConfirmed: false,
    validation: null,
    criteria: [],
    normalization: "minmax",
    method: "weighted_sum",
    useAhp: false,
    advFunction: functionUsesAdvanced(universe),
    advConstraints: constraintsUseAdvanced(stages),
    advObjective: false,
    aiOpen: false,
  };
}

// P1-2: deep link from chart map (/app/mapas) initializes with a chart stage.
function initialStages(params: { get(name: string): string | null }): StageState[] {
  if (params.get("novo_estagio") !== "chart") {
    const stage = initialLimitStage();
    // D-219: the glossary's "Usar como restrição" opens the first limit already
    // pointed at that property. Only the property: no value is ever invented.
    const slug = params.get("restricao");
    const first = stage.kind === "limit" ? stage.group.constraints[0] : undefined;
    if (first && slug && /^[a-z0-9_-]{1,120}$/.test(slug)) first.property_slug = slug;
    return [stage];
  }
  const xProp = params.get("x_prop");
  const yProp = params.get("y_prop");
  return [
    {
      id: nextEditorId("stage"),
      kind: "chart",
      label: "",
      enabled: true,
      x: {
        mode: xProp ? "property" : "expression",
        propertySlug: xProp ?? "",
        expression: params.get("x_expr") ?? "",
        min: params.get("x_min") ?? "",
        max: params.get("x_max") ?? "",
      },
      y: {
        mode: yProp ? "property" : "expression",
        propertySlug: yProp ?? "",
        expression: params.get("y_expr") ?? "",
        min: params.get("y_min") ?? "",
        max: params.get("y_max") ?? "",
      },
      indexExpression: "",
      indexGoal: "maximize",
      indexLevel: "",
    },
  ];
}

export function snapshotOf(state: WizardState): WizardSnapshot {
  return {
    name: state.name,
    functionText: state.functionText,
    objectiveText: state.objectiveText,
    freeVariables: state.freeVariables,
    universe: state.universe,
    stages: state.stages,
    indexMode: state.indexMode,
    customExpression: state.customExpression,
    indexGoal: state.indexGoal,
    indexConfirmed: state.indexConfirmed,
    criteria: state.criteria,
    method: state.method,
    normalization: state.normalization,
    useAhp: state.useAhp,
  };
}

/** `emptyLimitStage` is typed as any stage; this one is a limit stage by construction. */
function limitStageShape(stage: StageState): Extract<StageState, { kind: "limit" }> {
  if (stage.kind !== "limit") throw new Error("emptyLimitStage must build a limit stage");
  return stage;
}

function rowFromConstraint(constraint: ConstraintIn) {
  return {
    ...emptyConstraint(nextEditorId("row")),
    operator: constraint.operator,
    property_slug: constraint.property_slug ?? "",
    value: constraint.value?.toString() ?? "",
    value_min: constraint.value_min?.toString() ?? "",
    value_max: constraint.value_max?.toString() ?? "",
    unit: constraint.unit ?? "",
    class_slugs: constraint.class_slugs ?? [],
    text: constraint.text ?? "",
  };
}

/** A row with nothing in it: the blank one a new study opens with. */
function isBlankRow(row: ConstraintRow): boolean {
  return (
    row.property_slug === "" &&
    row.value === "" &&
    row.value_min === "" &&
    row.value_max === "" &&
    row.class_slugs.length === 0 &&
    row.text === ""
  );
}

/** Whether a row already says what `other` says, so applying a proposal twice adds nothing. */
function sameRow(a: ConstraintRow, b: ConstraintRow): boolean {
  return (
    a.operator === b.operator &&
    a.property_slug === b.property_slug &&
    a.value === b.value &&
    a.value_min === b.value_min &&
    a.value_max === b.value_max &&
    a.unit === b.unit &&
    a.text === b.text
  );
}

/**
 * Append limits to the first limit stage's root group, never into a group or
 * stage the assistant has no way to name. Blank rows are dropped and rows the
 * group already has are not repeated.
 */
function withAppendedConstraints(
  state: WizardState,
  rows: ConstraintRow[],
): WizardState {
  if (rows.length === 0) return state;
  const target = state.stages.findIndex((s) => s.kind === "limit");
  // No limit stage to append to: adding one is the honest outcome — dropping
  // the limits the reader just accepted would look like a dead button.
  if (target === -1) {
    return {
      ...state,
      stages: [
        ...state.stages,
        {
          ...limitStageShape(emptyLimitStage()),
          group: { ...emptyGroup(nextEditorId("group")), constraints: rows },
        },
      ],
    };
  }
  return {
    ...state,
    stages: state.stages.map((stage, i) => {
      if (i !== target || stage.kind !== "limit") return stage;
      const kept = stage.group.constraints.filter((row) => !isBlankRow(row));
      const fresh = rows.filter((row) => !kept.some((existing) => sameRow(existing, row)));
      return { ...stage, group: { ...stage.group, constraints: [...kept, ...fresh] } };
    }),
  };
}

/**
 * The assistant's proposal for one part (D-225), merged into the study.
 *
 * Function, objective and index replace what is there only when the proposal
 * has one; the limits are appended, never substituted — an interpretation adds
 * to what the user already wrote. The component's study carries the applied
 * limits only, so an AI suggestion the person did not confirm never gets here.
 */
function withPlanComponent(state: WizardState, component: PlanComponent): WizardState {
  let next: WizardState = { ...state };
  if (component.function_text) next.functionText = component.function_text;
  if (component.objective_text) next.objectiveText = component.objective_text;
  if (component.index) {
    next.indexMode = component.index.slug;
    next.indexGoal = component.index.goal;
    next.customExpression = "";
    next.validation = null;
  }
  if (next.criteria.length === 0 && component.study.criteria.length > 0) {
    next.criteria = component.study.criteria.map((c) => ({
      id: nextCriterionId(),
      key: c.key,
      direction: (c.direction as "max" | "min" | null) ?? "",
      weight: c.weight.toString(),
    }));
  }
  next = withAppendedConstraints(next, appliedConstraints(component.study).map(rowFromConstraint));
  return next;
}

/**
 * A plan's part as a whole study, for the draft the home writes (D-225): the
 * wizard opens on it exactly as it opens on a saved study. The catalogue's own
 * index slug is used when the part has one, never a different formula.
 */
export function stateFromPlanComponent(base: WizardState, component: PlanComponent): WizardState {
  const opened = stateFromStudy(base, studyDetailFromPlan(component.study));
  if (!component.index) return opened;
  return {
    ...opened,
    indexMode: component.index.slug,
    customExpression: "",
    indexGoal: component.index.goal,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "text":
      return { ...state, [action.field]: action.value };
    case "stages":
      return { ...state, stages: resolve(action.stages, state.stages) };
    case "criteria":
      return { ...state, criteria: resolve(action.criteria, state.criteria) };
    case "universe":
      // Switching universe starts the pipeline over: a stage — or a criterion —
      // of the other universe is refused by the backend by design (P0-3, D-84).
      if (action.universe === state.universe) return state;
      return {
        ...state,
        universe: action.universe,
        stages: [initialLimitStage()],
        criteria: [],
        indexMode: "none",
        indexConfirmed: false,
        customExpression: "",
        validation: null,
        useAhp: false,
      };
    case "indexMode":
      return { ...state, indexMode: action.mode, validation: null };
    case "customExpression":
      return { ...state, customExpression: action.expression, validation: null };
    case "indexGoal":
      return { ...state, indexGoal: action.goal };
    case "indexConfirmed":
      return { ...state, indexConfirmed: action.confirmed };
    case "validation":
      return { ...state, validation: action.message };
    case "method":
      return { ...state, method: action.method };
    case "normalization":
      return { ...state, normalization: action.normalization };
    case "useAhp":
      return { ...state, useAhp: action.value };
    case "advanced": {
      const key =
        action.section === "function"
          ? "advFunction"
          : action.section === "constraints"
            ? "advConstraints"
            : "advObjective";
      return { ...state, [key]: action.open };
    }
    case "toggleAi":
      return { ...state, aiOpen: !state.aiOpen };
    case "restore":
      // A snapshot (undo, draft) puts the study back; the "Opções avançadas"
      // reopen wherever what they hide is in use (D-85).
      return {
        ...state,
        ...action.snapshot,
        advFunction: functionUsesAdvanced(action.snapshot.universe),
        advConstraints: constraintsUseAdvanced(action.snapshot.stages),
      };
    case "replace":
      return action.state;
    case "plan":
      return withPlanComponent(state, action.component);
  }
}

/**
 * One persisted stage as the editor holds it.
 *
 * A named function with an exhaustive switch: with several kinds a ternary
 * maps the last one to whichever branch is the fallback, so reopening a saved
 * study could quietly turn a process stage into an empty limit stage.
 */
export function stageFromPayload(
  stage: StageOut,
  combinator: Combinator,
  fallbackRootGroup?: ConstraintGroupIn | null,
): StageState {
  const common = {
    id: nextEditorId("stage"),
    label: stage.label ?? "",
    enabled: stage.enabled,
    notes: stage.notes ?? "",
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
        // and a study whose row somehow lost it reopens as a blank plane.
        x: chartAxisFromPayload(stage.chart?.x),
        y: chartAxisFromPayload(stage.chart?.y),
        indexExpression: stage.chart?.index_expression ?? "",
        indexGoal: stage.chart?.index_goal ?? "maximize",
        indexLevel: boundToField(stage.chart?.index_level),
      };
    case "limit": {
      const groupPayload = stage.root_group ?? fallbackRootGroup;
      return {
        ...common,
        kind: "limit",
        group: groupPayload
          ? fromConstraintPayload(groupPayload)
          : emptyGroup(nextEditorId("group"), combinator),
      };
    }
  }
}

/**
 * A saved study as the wizard edits it.
 *
 * P0-1 closes M6's read-side gap: `StudyOut.stages` carries each stage's real
 * tree. A study whose payload somehow has no stage falls back to root_group or
 * the flat list — the pre-M6 shape — rather than opening empty.
 */
export function stateFromStudy(base: WizardState, s: StudyDetail): WizardState {
  const limitStagesCount = s.stages.filter((st) => st.kind === "limit").length;
  const fallbackRoot = limitStagesCount === 1 ? s.root_group : null;
  const stages: StageState[] =
    s.stages.length > 0
      ? s.stages.map((stage) => stageFromPayload(stage, s.combinator, fallbackRoot))
      : [
          {
            id: nextEditorId("stage"),
            kind: "limit",
            label: "",
            enabled: true,
            group: s.root_group
              ? fromConstraintPayload(s.root_group)
              : {
                  ...emptyGroup(nextEditorId("group"), s.combinator),
                  constraints: s.constraints.map(rowFromConstraint),
                },
          },
        ];
  return {
    ...base,
    name: s.name,
    functionText: s.function_text ?? "",
    objectiveText: s.objective_text ?? "",
    freeVariables: s.free_variables.join(", "),
    studyNotes: s.notes ?? "",
    universe: s.universe,
    stages,
    indexMode: s.index ? "custom" : "none",
    customExpression: s.index ? s.index.expression : base.customExpression,
    indexGoal: s.index ? s.index.goal : base.indexGoal,
    indexConfirmed: true,
    normalization: s.normalization,
    method: s.method,
    criteria: s.criteria.map((c) => ({
      id: nextCriterionId(),
      key: c.key,
      direction: (c.direction as "max" | "min" | null) ?? "",
      weight: c.weight.toString(),
    })),
    advFunction: functionUsesAdvanced(s.universe),
    advConstraints: constraintsUseAdvanced(stages),
    advObjective: objectiveUsesAdvanced({
      method: s.method,
      normalization: s.normalization,
      useAhp: false,
    }),
  };
}

/** The one-click example (D-85) as a study: the caller has checked the catalogue has it. */
export function stateFromExample(base: WizardState, example: SelectionExample): WizardState {
  const stages: StageState[] = [
    {
      id: nextEditorId("stage"),
      kind: "limit",
      label: "",
      enabled: true,
      group: fromConstraintPayload({ operator: "AND", constraints: example.constraints, groups: [] }),
    },
  ];
  return {
    ...base,
    name: example.name,
    functionText: example.functionText,
    objectiveText: example.objectiveText,
    freeVariables: example.freeVariables.join(", "),
    universe: "material",
    stages,
    indexMode: example.indexSlug,
    customExpression: "",
    indexConfirmed: true,
    criteria: example.criteria.map((c) => ({ id: nextCriterionId(), direction: "", ...c })),
    method: "weighted_sum",
    normalization: "minmax",
    useAhp: false,
    advFunction: false,
    advConstraints: constraintsUseAdvanced(stages),
    advObjective: false,
  };
}

/**
 * A ready-made study (D-210) as the wizard edits it.
 *
 * The template is formulation only: its limits are "the data the index reads
 * must exist", with no threshold. The index is the catalogue's when the
 * catalogue has that slug, and otherwise the same expression as a custom one —
 * never a different formula.
 */
export function stateFromTemplate(
  base: WizardState,
  template: StudyTemplate,
  catalogueIndexSlugs: readonly string[],
): WizardState {
  const stages: StageState[] = template.stages.map((stage) => ({
    id: nextEditorId("stage"),
    kind: "limit",
    label: stage.label ?? "",
    enabled: stage.enabled ?? true,
    group: stage.root_group
      ? fromConstraintPayload({ ...stage.root_group, groups: stage.root_group.groups ?? [] })
      : emptyGroup(nextEditorId("group")),
  }));
  const fromCatalogue =
    template.index_slug !== null && catalogueIndexSlugs.includes(template.index_slug);
  return {
    ...base,
    name: template.name,
    functionText: template.function_text,
    // The design constraint is part of what the objective means ("mínima
    // massa *com rigidez especificada*"), so it travels with it, in words.
    objectiveText: `${template.objective_text} (${template.design_constraint})`,
    freeVariables: template.free_variables.join(", "),
    universe: template.universe,
    stages: stages.length > 0 ? stages : [initialLimitStage()],
    indexMode: fromCatalogue ? (template.index_slug as string) : "custom",
    customExpression: fromCatalogue ? "" : template.index.expression,
    indexGoal: template.index.goal ?? "maximize",
    indexConfirmed: true,
    validation: null,
    criteria: template.criteria.map((c) => ({
      id: nextCriterionId(),
      key: c.key,
      direction: c.direction ?? "",
      weight: String(c.weight),
    })),
    method: "weighted_sum",
    normalization: "minmax",
    useAhp: false,
    advFunction: functionUsesAdvanced(template.universe),
    advConstraints: constraintsUseAdvanced(stages),
    advObjective: false,
  };
}
