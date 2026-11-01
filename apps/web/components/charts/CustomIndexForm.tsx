"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, evaluateIndex } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  MAX_COMPUTED,
  expressionKey,
  expressionVariable,
  usableExamples,
} from "@/lib/compare-expression";
import { Button, Input, RemovableChip } from "@/components/ui";

const t = ptBR.compare.computed.custom;

/**
 * A free-typed index for the comparator (D-153).
 *
 * The page does not read, parse or evaluate what is typed: the expression goes
 * to the same validator the selection uses (`POST /api/selection/index`) and,
 * once accepted, to the comparison as a `computed` entry. A refused expression
 * is answered here, in the backend's own written message, so one typo never
 * takes the whole comparison table away with it.
 */
export function CustomIndexForm({
  expressions,
  takenKeys,
  total,
  slugs,
  slugsLoading,
  onAdd,
  onRemove,
}: {
  /** What the reader has typed so far, in order. */
  expressions: string[];
  /** Keys of every column already requested (catalogue and typed). */
  takenKeys: ReadonlySet<string>;
  /** How many computed columns the request already carries. */
  total: number;
  /** Property slugs: the names an expression may use. */
  slugs: string[] | undefined;
  slugsLoading: boolean;
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
  const variables = (slugs ?? []).map(expressionVariable);
  const examples = usableExamples(new Set(variables));

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
      <div className="flex flex-wrap items-start gap-3">
        <Input
          label={t.label}
          hint={t.hint}
          error={error ?? undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t.placeholder}
          autoComplete="off"
          spellCheck={false}
          className="min-w-[min(16rem,100%)] flex-1"
        />
        <div className="pt-6">
          <Button type="submit" size="sm" variant="secondary" loading={validate.isPending}>
            {t.add}
          </Button>
        </div>
      </div>

      {examples.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.examples}>
          <span className="text-support text-ink-subtle">{t.examples}:</span>
          {examples.map((example) => (
            <Button
              key={example}
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t.useExample(example)}
              onClick={() => {
                setText(example);
                setError(null);
              }}
            >
              <code className="font-mono text-2xs">{example}</code>
            </Button>
          ))}
        </div>
      )}

      <details className="text-support text-ink-muted">
        <summary className="cursor-pointer">{t.variables(variables.length)}</summary>
        {slugsLoading ? (
          <p className="mt-1">{t.variablesLoading}</p>
        ) : variables.length === 0 ? (
          <p className="mt-1">{t.variablesNone}</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {variables.map((name) => (
              <li key={name}>
                <code className="font-mono text-2xs text-ink">{name}</code>
              </li>
            ))}
          </ul>
        )}
      </details>

      {expressions.length > 0 && (
        <ul aria-label={t.listLabel} className="flex flex-wrap gap-2">
          {expressions.map((expression) => (
            <li key={expression}>
              <RemovableChip removeLabel={t.remove} onRemove={() => onRemove(expression)}>
                {expression}
              </RemovableChip>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
