import type { Step as StepItem } from "@/components/ui";
import { ptBR } from "@/lib/i18n";

const t = ptBR.selection;

export type Step = "function" | "constraints" | "objective" | "results";

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

// D-88: Objetivo before Restrições. The order of the screen, not of the
// method: the engine still filters and only then ranks. Navigation, the Run
// button and the step a loaded study opens on all derive from this list.
export const STEPS: StepItem<Step>[] = [
  { id: "function", label: t.stepFunction },
  { id: "objective", label: t.stepObjective },
  { id: "constraints", label: t.stepConstraints },
  { id: "results", label: t.stepResults, blockedReason: t.blockedResults },
];

/** The step named by `?etapa=`; anything else (including `toString`) is none. */
export function stepFromSlug(slug: string | null): Step | undefined {
  return slug !== null && Object.hasOwn(STEP_BY_SLUG, slug) ? STEP_BY_SLUG[slug] : undefined;
}

export const SLUG_BY_STEP = Object.fromEntries(
  Object.entries(STEP_BY_SLUG).map(([slug, id]) => [id, slug]),
) as Record<Step, string>;

/**
 * Navigation is read off the order of `STEPS`, never written per step (D-85):
 * the previous and next step are neighbours in the list, and Run sits on the
 * last step the reader fills in. Reordering the wizard is then reordering the
 * list — nothing else can drift out of step with it.
 */
export const INPUT_STEPS: Step[] = STEPS.filter((s) => s.id !== "results").map((s) => s.id);
export const LAST_INPUT_STEP: Step = INPUT_STEPS[INPUT_STEPS.length - 1] ?? "constraints";

export function neighbours(step: Step): { prev: Step | null; next: Step | null } {
  const i = STEPS.findIndex((s) => s.id === step);
  return { prev: STEPS[i - 1]?.id ?? null, next: STEPS[i + 1]?.id ?? null };
}

export function labelOf(step: Step): string {
  return STEPS.find((s) => s.id === step)?.label ?? step;
}

/** Where a field lives, so "what is missing" can take the reader to it (D-210). */
export interface FieldTarget {
  step: Step;
  /** The DOM id of the field, or of the block holding it. */
  fieldId: string;
}

/**
 * Focus a field by id once its step is on screen. A block id focuses the first
 * control inside it — an expression builder or a criterion row is a group of
 * controls, and the first is where the reader starts.
 */
export function focusField(fieldId: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(fieldId);
  if (!el) return false;
  const control = el.matches("input, select, textarea")
    ? el
    : el.querySelector<HTMLElement>("input, select, textarea, [tabindex]:not([tabindex='-1'])");
  const target = control ?? el;
  if (!control && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  target.focus();
  target.scrollIntoView?.({ block: "center" });
  return true;
}
