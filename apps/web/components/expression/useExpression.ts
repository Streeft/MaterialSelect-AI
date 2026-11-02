"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ExpressionUniverse } from "@materialselect/shared-types";
import { describeExpression, getExpressionPalette } from "@/lib/api";

/** Five minutes: the catalogue does not change while someone builds a formula. */
const STALE_MS = 5 * 60 * 1000;

export const expressionPaletteKey = (universe: ExpressionUniverse) =>
  ["expression-palette", universe] as const;

export const expressionDescribeKey = (universe: ExpressionUniverse, expression: string) =>
  ["expression-describe", universe, expression.trim()] as const;

/** Properties, functions and constants an expression may use (D-191). */
export function useExpressionPalette(universe: ExpressionUniverse) {
  return useQuery({
    queryKey: expressionPaletteKey(universe),
    queryFn: () => getExpressionPalette(universe),
    staleTime: STALE_MS,
  });
}

/**
 * The backend's reading of an expression: friendly LaTeX, dimension, unit and
 * errors. Keeps the previous answer on screen while the next one is asked,
 * so the display does not flash empty on every keystroke.
 */
export function useExpressionDescription(
  expression: string,
  universe: ExpressionUniverse,
  { keepPrevious = false }: { keepPrevious?: boolean } = {},
) {
  const trimmed = expression.trim();
  return useQuery({
    queryKey: expressionDescribeKey(universe, trimmed),
    queryFn: () => describeExpression(trimmed, universe),
    enabled: trimmed.length > 0,
    staleTime: STALE_MS,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  });
}
