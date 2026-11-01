"use client";

import { useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import type { ExpressionUniverse } from "@materialselect/shared-types";
import { cn } from "@/lib/cn";
import { expressionText } from "@/lib/i18n-expression";
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
      <span className={cn("inline-flex align-middle", className)}>
        <span aria-hidden="true" className="inline-block h-4 w-24 motion-safe:animate-pulse rounded bg-well" />
        <span className="sr-only">{expressionText.checking}</span>
      </span>
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

/**
 * The properties an expression reads, by name ("Módulo de Young, Densidade"),
 * from the same cached description. Falls back to the grammar names only when
 * there is nothing else to show (no query client, or the backend refused it).
 */
export function ExpressionInputs({
  expression,
  variables,
  universe = "material",
}: {
  expression: string;
  /** The grammar names the backend listed, used only as a fallback. */
  variables: string[];
  universe?: ExpressionUniverse;
}) {
  const client = useContext(QueryClientContext);
  if (!client) return <>{variables.join(", ")}</>;
  return <DescribedInputs expression={expression} variables={variables} universe={universe} />;
}

function DescribedInputs({
  expression,
  variables,
  universe,
}: {
  expression: string;
  variables: string[];
  universe: ExpressionUniverse;
}) {
  const described = useExpressionDescription(expression, universe);
  const names = described.data?.variables.map((v) => v.name);
  if (names && names.length > 0) return <>{names.join(", ")}</>;
  if (described.isError || (described.data && names?.length === 0)) {
    return <>{variables.join(", ")}</>;
  }
  return <>…</>;
}
