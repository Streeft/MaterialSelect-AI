"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, evaluateIndex } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { MAX_COMPUTED, expressionKey } from "@/lib/compare-expression";
import { Button, RemovableChip } from "@/components/ui";
import { ExpressionBuilder } from "@/components/expression/ExpressionBuilder";
import { useExpressionDescription } from "@/components/expression/useExpression";

const t = ptBR.compare.computed.custom;

/**
 * An index built by the reader for the comparator (D-153, D-191).
 *
 * The page does not read, parse or evaluate the expression: it is built in the
 * visual calculator (whose display is the backend's own description of it),
 * goes to the same validator the selection uses (`POST /api/selection/index`)
 * and, once accepted, to the comparison as a `computed` entry. A refused
 * expression is answered here, in the backend's own written message, so one
 * typo never takes the whole comparison table away with it.
 */
export function CustomIndexForm({
  expressions,
  takenKeys,
  total,
  onAdd,
  onRemove,
}: {
  /** What the reader has added so far, in order. */
  expressions: string[];
  /** Keys of every column already requested (catalogue and typed). */
  takenKeys: ReadonlySet<string>;
  /** How many computed columns the request already carries. */
  total: number;
  onAdd: (expression: string) => void;
  onRemove: (expression: string) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validate = useMutation({
    mutationFn: (expression: string) => evaluateIndex(expression, "maximize"),
    onSuccess: (_result, expression) => {
      onAdd(expression);
      setText("");
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : t.genericError),
  });

  const atLimit = total >= MAX_COMPUTED;

  function submit(event: FormEvent) {
    event.preventDefault();
    const expression = text.trim();
    if (!expression) {
      setError(t.empty);
      return;
    }
    if (takenKeys.has(expressionKey(expression))) {
      setError(t.duplicate);
      return;
    }
    if (atLimit) {
      setError(t.limit(MAX_COMPUTED));
      return;
    }
    setError(null);
    validate.mutate(expression);
  }

  return (
    <form onSubmit={submit} className="well flex flex-col gap-3" aria-label={t.title}>
      <ExpressionBuilder
        label={t.title}
        typedLabel={t.label}
        value={text}
        onChange={(next) => {
          setText(next);
          if (error) setError(null);
        }}
        error={error ?? undefined}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="secondary" loading={validate.isPending}>
          {t.add}
        </Button>
      </div>

      {expressions.length > 0 && (
        <ul aria-label={t.listLabel} className="flex flex-wrap gap-2">
          {expressions.map((expression) => (
            <li key={expression}>
              <AddedExpression expression={expression} onRemove={() => onRemove(expression)} />
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** An added index, named by its reading ("Módulo de Young / Densidade"), never its grammar. */
function AddedExpression({ expression, onRemove }: { expression: string; onRemove: () => void }) {
  const described = useExpressionDescription(expression, "material");
  const label = described.isError ? expression : (described.data?.label ?? "…");
  return (
    <RemovableChip removeLabel={t.remove} onRemove={onRemove}>
      {label}
    </RemovableChip>
  );
}
