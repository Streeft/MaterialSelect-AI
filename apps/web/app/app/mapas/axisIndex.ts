import type { IndexIn, PerformanceIndex } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  describeCustomIndex,
  describeIndex,
  type IndexDescriptor,
} from "@/components/selection/IndexCard";
import type { AxisState } from "./url-state";

const t = ptBR.map;

/** The axis's index, resolved to a request-ready `IndexIn` — or null while incomplete. */
export function resolveAxisIndex(axis: AxisState, indices: PerformanceIndex[]): IndexIn | null {
  if (axis.mode !== "index") return null;
  if (axis.indexSlug === "custom") {
    const expression = axis.customExpression.trim();
    return expression ? { name: t.indexCustom, expression, goal: axis.goal } : null;
  }
  const chosen = indices.find((i) => i.slug === axis.indexSlug);
  return chosen ? { name: chosen.name, expression: chosen.expression, goal: chosen.goal } : null;
}

/** Same choice as `resolveAxisIndex`, kept whole so the card can explain the index. */
export function describeAxisIndex(axis: AxisState, indices: PerformanceIndex[]): IndexDescriptor | null {
  if (axis.mode !== "index") return null;
  if (axis.indexSlug === "custom") {
    const expression = axis.customExpression.trim();
    return expression ? describeCustomIndex(expression, axis.goal) : null;
  }
  const chosen = indices.find((i) => i.slug === axis.indexSlug);
  return chosen ? describeIndex(chosen) : null;
}

