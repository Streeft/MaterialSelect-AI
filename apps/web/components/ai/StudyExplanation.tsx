"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, explainStudy } from "@/lib/api";
import type { Explanation } from "@/lib/types";
import { ptBR } from "@/lib/i18n";

const t = ptBR.ai;

/**
 * Prose about a saved study, written from the numbers the pipeline produced.
 *
 * The button re-runs the study server-side before writing, so the text always
 * describes a current computation rather than a remembered one. If the wording
 * were ever to cite a figure the run did not produce, the API rejects it and
 * this component shows the refusal instead of the prose.
 */
export function StudyExplanation({ studyId }: { studyId: number }) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="mt-2 rounded-md border border-violet-200 bg-violet-50/40 p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-800">
            {t.explanationTitle}: {explanation.study_name}
          </h4>
          <button
            type="button"
            onClick={() => setExplanation(null)}
            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:bg-white"
          >
            {t.close}
          </button>
        </div>

        <p className="mt-1 text-sm font-medium text-slate-700">{explanation.summary}</p>
        {explanation.paragraphs.map((paragraph, i) => (
          <p key={i} className="mt-2 text-sm text-slate-600">
            {paragraph}
          </p>
        ))}

        {explanation.caveats.length > 0 && (
          <div className="mt-3 rounded bg-amber-50 px-3 py-2">
            <h5 className="text-xs font-semibold text-amber-800">{t.caveats}</h5>
            <ul className="mt-1 space-y-1 text-xs text-amber-800">
              {explanation.caveats.map((caveat, i) => (
                <li key={i}>• {caveat}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-2 text-xs text-slate-400">{explanation.disclaimer}</p>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => explain.mutate()}
        disabled={explain.isPending}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-violet-800 hover:bg-slate-50 disabled:opacity-50"
      >
        {explain.isPending ? t.explaining : t.explain}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </>
  );
}
