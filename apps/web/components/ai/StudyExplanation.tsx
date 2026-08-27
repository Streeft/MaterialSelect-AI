"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError, explainStudy, getAIStatus } from "@/lib/api";
import type { Explanation } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { Alert, Button, Card, CardBody, CardHeader } from "@/components/ui";

const t = ptBR.ai;

/**
 * Prose about a saved study, written from the numbers the pipeline produced.
 *
 * The button re-runs the study server-side before writing, so the text always
 * describes a current computation rather than a remembered one. If the wording
 * were ever to cite a figure the run did not produce, the API rejects it and
 * this component shows the refusal instead of the prose.
 *
 * That the text came from the AI layer is stated in the title and in the
 * disclaimer, not in a colour. A tint the reader has to have been taught is the
 * same failure the data-quality badges avoid (D-24).
 */
export function StudyExplanation({ studyId }: { studyId: number }) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({ queryKey: ["ai-status"], queryFn: getAIStatus });

  const explain = useMutation({
    mutationFn: () => explainStudy(studyId),
    onSuccess: (data) => {
      setExplanation(data);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : t.explainError),
  });

  if (explanation) {
    return (
      <Card className="mt-2 text-left">
        <CardHeader
          title={`${t.explanationTitle}: ${explanation.study_name}`}
          headingLevel={4}
          actions={
            <Button size="sm" variant="ghost" onClick={() => setExplanation(null)}>
              {t.close}
            </Button>
          }
        />
        <CardBody className="space-y-2">
          <p className="max-w-prose text-sm font-medium text-ink">{explanation.summary}</p>
          {explanation.paragraphs.map((paragraph, i) => (
            <p key={i} className="max-w-prose text-sm text-ink-muted">
              {paragraph}
            </p>
          ))}

          {explanation.caveats.length > 0 && (
            <Alert tone="warning" title={t.caveats}>
              <ul className="list-disc space-y-1 pl-4 text-xs">
                {explanation.caveats.map((caveat, i) => (
                  <li key={i}>{caveat}</li>
                ))}
              </ul>
            </Alert>
          )}

          {explanation.sources.length > 0 && (
            <div className="text-2xs text-ink-subtle">
              <p className="font-medium">{t.sourcesConsulted}:</p>
              <ul className="list-disc pl-4">
                {explanation.sources.map((source, i) => (
                  <li key={i}>
                    {source.document_title}
                    {source.page_start && source.page_end
                      ? ` (p. ${source.page_start}-${source.page_end})`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="max-w-prose text-2xs text-ink-subtle">{explanation.disclaimer}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        loading={explain.isPending}
        onClick={() => explain.mutate()}
      >
        {explain.isPending
          ? status.data?.simulated
            ? t.explaining
            : t.explainingWithKnowledge
          : t.explain}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger-fg">
          {error}
        </p>
      )}
    </>
  );
}
