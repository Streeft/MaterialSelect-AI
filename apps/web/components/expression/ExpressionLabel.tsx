"use client";

import { useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import type { ExpressionUniverse } from "@materialselect/shared-types";
import { cn } from "@/lib/cn";
import { useExpressionDescription } from "./useExpression";
import { MathTex } from "./MathTex";

/**
 * An index expression as a reader sees it (D-191): "Módulo de Young /
 * Densidade" typeset as a fraction, never `modulo_young / densidade`.
 *
 * The LaTeX comes from `/api/expressions/describe`, cached per expression, so
 * a results table with ten typed indices asks ten times once. While it loads
 * the slot holds a placeholder rather than the grammar text; only when the
 * backend cannot read the expression at all (or there is no query client, in
 * an isolated component test) is the text shown as written — it is then the
 * only thing there is to show.
 */
export function ExpressionLabel({
  expression,
  universe = "material",
  notation = "names",
  display = false,
  className,
}: {
  expression: string;
  universe?: ExpressionUniverse;
  notation?: "names" | "symbols";
  display?: boolean;
  className?: string;
}) {
  const client = useContext(QueryClientContext);
  if (!client) return <RawExpression expression={expression} className={className} />;
  return (
    <DescribedExpression
      expression={expression}
      universe={universe}
      notation={notation}
      display={display}
      className={className}
    />
  );
}

function RawExpression({ expression, className }: { expression: string; className?: string }) {
  return <code className={cn("font-mono text-xs", className)}>{expression}</code>;
}

function DescribedExpression({
  expression,
  universe,
  notation,
  display,
  className,
}: {
  expression: string;
  universe: ExpressionUniverse;
  notation: "names" | "symbols";
  display: boolean;
  className?: string;
}) {
  const described = useExpressionDescription(expression, universe);
  const data = described.data;
  if (described.isPending && described.fetchStatus !== "idle") {
    return (
      <span
        className={cn("inline-block h-4 w-24 animate-pulse rounded bg-well align-middle", className)}
        aria-busy="true"
        aria-label="…"
      />
    );
  }
  const latex = notation === "symbols" ? (data?.latex_symbols ?? data?.latex) : data?.latex;
  if (!data || !latex) return <RawExpression expression={expression} className={className} />;
  return (
    <MathTex
      latex={latex}
      label={data.label ?? expression}
      display={display}
      className={className}
    />
  );
}
