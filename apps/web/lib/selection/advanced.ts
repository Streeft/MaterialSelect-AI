import type { MethodLiteral, NormalizationMethod, SelectionUniverse } from "@/lib/types";
import {
  emptyConstraint,
  emptyGroup,
  nextEditorId,
  type ConstraintGroupState,
} from "@/components/selection/ConstraintEditor";
import type { StageState } from "@/components/selection/StageList";

/**
 * When a guided screen must open its "Opções avançadas" by itself (D-85).
 *
 * The rule: a collapsed section hides the ways to *add* complexity, never
 * complexity that is already there. So a loaded study, the example or a deep
 * link that uses an advanced option opens that section — a TOPSIS study that
 * reopened with the method toggle folded away would look like a weighted sum.
 */

function groupUsesAdvanced(group: ConstraintGroupState): boolean {
  return group.operator === "OR" || group.groups.length > 0;
}

export function constraintsUseAdvanced(stages: StageState[]): boolean {
  if (stages.length !== 1) return true;
  const only = stages[0];
  if (!only || only.kind !== "limit") return true;
  return only.label.trim() !== "" || !only.enabled || groupUsesAdvanced(only.group);
}

export function objectiveUsesAdvanced(options: {
  method: MethodLiteral;
  normalization: NormalizationMethod;
  useAhp: boolean;
}): boolean {
  return (
    options.method !== "weighted_sum" || options.normalization !== "minmax" || options.useAhp
  );
}

export function functionUsesAdvanced(universe: SelectionUniverse): boolean {
  return universe === "process";
}

/** The stage a study starts with: one limit stage with one row ready to fill. */
export function initialLimitStage(): StageState {
  return {
    id: nextEditorId("stage"),
    kind: "limit",
    label: "",
    enabled: true,
    group: {
      ...emptyGroup(nextEditorId("group")),
      constraints: [emptyConstraint(nextEditorId("row"))],
    },
  };
}
