/**
 * "Abrir na Seleção" from the project assistant (D-225).
 *
 * The part's study is written into the wizard's saved draft (D-139) — the same
 * format the wizard writes itself — and the wizard opens on it. It goes through
 * the draft, not through the address, because a study is too large for a link,
 * and through the wizard's own `stateFromStudy`, so a proposal opens exactly
 * like a saved study. It is a draft in this browser: nothing reaches the server
 * until the person saves it from the wizard (principle 2 — it ranks nothing).
 */
import type { PlanComponent } from "@/lib/types";
import {
  type DraftData,
  draftKey,
  readDraft,
  serializeDraft,
  writeDraft,
} from "@/lib/selectionDraft";
import {
  initialWizardState,
  snapshotOf,
  stateFromPlanComponent,
} from "@/app/app/selecao/wizardState";

/** `?rascunho=assistente`: the wizard continues the draft the assistant wrote, without asking. */
export const PLAN_DRAFT_PARAM = "rascunho";
export const PLAN_DRAFT_VALUE = "assistente";

/** The wizard's address for the draft the assistant just wrote. */
export const PLAN_DRAFT_HREF = `/app/selecao?etapa=restricoes&${PLAN_DRAFT_PARAM}=${PLAN_DRAFT_VALUE}`;

/** Whether this reader's browser already holds a draft the write would replace. */
export function hasSelectionDraft(userId: number | string): boolean {
  return readDraft(draftKey(userId)) !== null;
}

/** Write the part's study as the reader's draft; `false` when storage refused. */
export function writePlanDraft(userId: number | string, component: PlanComponent): boolean {
  const base = initialWizardState({ get: () => null });
  const state = stateFromPlanComponent(base, component);
  const text = serializeDraft("constraints", snapshotOf(state) as unknown as DraftData);
  return writeDraft(draftKey(userId), text);
}
