/**
 * The project assistant's proposal, as the screens read it (D-224, D-225).
 *
 * Pure helpers only: what an origin is, how a component goes back to the server
 * with the person's choices, and what a "compare" link carries. Nothing here
 * computes a property value, a limit or a ranking — those come from the
 * backend (principle 2); this file only moves them around.
 */
import type {
  ConstraintIn,
  PlanComponent,
  PlanComponentRunIn,
  PlanConstraint,
  PlanOrigin,
  PlanRunRequest,
  ProjectPlan,
  StudyDetail,
  StudyIn,
} from "@/lib/types";
import { encodeIdList } from "@/lib/idList";

/** Fewer characters than this is not a request yet: the wizard does not interpret while typing. */
export const PLAN_MIN_CHARS = 15;
/** How long the wizard waits after the last keystroke before interpreting. */
export const PLAN_DEBOUNCE_MS = 1500;
/** The API's limit for the request text. */
export const PLAN_MAX_CHARS = 4000;

export type OriginKind = "usuario" | "cenario" | "sugestao_ia" | "indice";

export function originKind(origin: PlanOrigin): OriginKind {
  if (origin.startsWith("cenario:")) return "cenario";
  if (origin === "sugestao_ia") return "sugestao_ia";
  if (origin === "indice") return "indice";
  return "usuario";
}

/** The scenario id inside `cenario:<id>`, or `null` for any other origin. */
export function scenarioId(origin: PlanOrigin): string | null {
  return origin.startsWith("cenario:") ? origin.slice("cenario:".length) : null;
}

/** An AI suggestion is the only limit that waits for the person. */
export function isSuggestion(constraint: PlanConstraint): boolean {
  return constraint.origin === "sugestao_ia";
}

/** Whether the person can enter the text: long enough to be a request. */
export function isInterpretable(text: string): boolean {
  return text.trim().length >= PLAN_MIN_CHARS;
}

/**
 * The component as `POST /ai/plan/run` takes it back. The numbers of a scenario
 * limit are re-read from the table by the server, and an AI suggestion runs
 * only when `confirmed` — so `confirmed` is the one thing the person decides,
 * and `confirm` says it for the suggestion being toggled.
 */
export function runRequestFor(
  component: PlanComponent,
  confirm?: { index: number; confirmed: boolean },
): PlanComponentRunIn {
  return {
    key: component.key,
    name: component.name,
    role: component.role,
    function_text: component.function_text,
    objective_text: component.objective_text,
    index_slug: component.index?.slug ?? null,
    criteria: component.criteria.map(({ property, direction }) => ({ property, direction })),
    constraints: component.constraints.map((constraint, i) => ({
      property: constraint.property,
      operator: constraint.operator,
      value: constraint.value,
      value_min: constraint.value_min,
      value_max: constraint.value_max,
      unit: constraint.unit,
      level: constraint.level,
      origin: constraint.origin,
      confirmed: isSuggestion(constraint)
        ? confirm && confirm.index === i
          ? confirm.confirmed
          : constraint.applied
        : undefined,
      note: constraint.note,
    })),
  };
}

/** A new run of the whole plan with one suggestion confirmed or taken back. */
export function confirmationRequest(
  plan: ProjectPlan,
  componentKey: string,
  index: number,
  confirmed: boolean,
): PlanRunRequest {
  return {
    components: plan.components.map((component) =>
      runRequestFor(component, component.key === componentKey ? { index, confirmed } : undefined),
    ),
  };
}

/**
 * The plan with the components the server just re-ran. The summary, the
 * premises and the scenarios are the model's reading of the text and stay;
 * everything that depends on the run (limits, funnel, materials, study) is the
 * server's new answer.
 */
export function withRerun(plan: ProjectPlan, components: PlanComponent[]): ProjectPlan {
  const byKey = new Map(components.map((component) => [component.key, component]));
  return { ...plan, components: plan.components.map((c) => byKey.get(c.key) ?? c) };
}

/** `/app/comparar?materiais=` with the materials the server ranked, in rank order. */
export function compareHref(component: PlanComponent): string | null {
  const ids = (component.result?.materials ?? []).map((m) => m.record_id);
  return ids.length >= 2 ? `/app/comparar?materiais=${encodeIdList(ids)}` : null;
}

/** The materials' page, the one place every catalogue row leads to. */
export function materialHref(recordId: number): string {
  return `/app/materiais/${recordId}`;
}

/** The limits that need an answer from the person before they count. */
export function pendingSuggestions(component: PlanComponent): PlanConstraint[] {
  return component.constraints.filter((c) => isSuggestion(c) && !c.applied);
}

/**
 * The plan's study as the shape a saved study has, so the wizard's own
 * `stateFromStudy` can open it. `id` and `created_at` are placeholders: the
 * study is a draft in this browser and reaches the server only when the person
 * saves it from the wizard.
 */
export function studyDetailFromPlan(study: StudyIn): StudyDetail {
  const stages = study.stages ?? [];
  return {
    universe: study.universe ?? "material",
    id: 0,
    name: study.name,
    description: study.description ?? null,
    function_text: study.function_text ?? null,
    objective_text: study.objective_text ?? null,
    free_variables: study.free_variables,
    combinator: study.combinator ?? "AND",
    constraints: study.constraints ?? [],
    root_group: study.root_group ?? null,
    stages: stages.map((stage, position) => ({
      position,
      kind: stage.kind,
      label: stage.label ?? null,
      enabled: stage.enabled,
      root_group: stage.root_group ?? null,
      class_slugs: stage.class_slugs ?? [],
      process_slugs: stage.process_slugs ?? [],
      process_class_slugs: stage.process_class_slugs ?? [],
      material_class_slugs: stage.material_class_slugs ?? [],
      chart: stage.chart ?? null,
      include_descendants: stage.include_descendants ?? true,
      notes: stage.notes ?? null,
    })),
    index: study.index ?? null,
    normalization: study.normalization,
    method: study.method,
    criteria: study.criteria,
    notes: study.notes ?? null,
    created_at: "",
  };
}

/** The limits of the plan's study that are applied, as the wizard's rows take them. */
export function appliedConstraints(study: StudyIn): ConstraintIn[] {
  const out: ConstraintIn[] = [];
  for (const stage of study.stages ?? []) {
    if (stage.kind === "limit") out.push(...(stage.root_group?.constraints ?? []));
  }
  return out;
}
