"use client";

import { Button, EmptyState } from "@/components/ui";
import { ResultsView } from "@/components/selection/ResultsView";
import { RunComparison } from "@/components/selection/RunComparison";
import { ptBR } from "@/lib/i18n";
import type { RunResult } from "@/lib/types";

const t = ptBR.selection;

/**
 * Step 4: the run's answer (D-85), and — once the same study has run twice in
 * this session — what changed between the two runs (D-210).
 */
export function ResultsStep({
  result,
  previous,
  runKey,
  canRun,
  offerRun,
  running,
  onRun,
  onGoToLimits,
}: {
  result: RunResult | null;
  /** The run before `result`, of the same study; `null` when there is none. */
  previous: RunResult | null;
  runKey: number;
  canRun: boolean;
  /** Whether the empty state offers Run itself, or the way to the limits. */
  offerRun: boolean;
  running: boolean;
  onRun: () => void;
  onGoToLimits: () => void;
}) {
  if (!result) {
    // D-202: before any run there is nothing to say about candidates — not
    // "none passed the limits" (that is a result) — only that it has not run,
    // and the way to run it from right here.
    return (
      <EmptyState
        title={t.notRunTitle}
        description={t.notRunDescription}
        action={
          offerRun ? (
            <Button variant="primary" loading={running} disabled={!canRun} onClick={onRun}>
              {running ? t.running : t.run}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onGoToLimits}>
              {t.notRunGoToLimits}
            </Button>
          )
        }
      />
    );
  }
  return (
    <div className="space-y-8">
      <ResultsView result={result} />
      {previous && <RunComparison previous={previous} current={result} runKey={runKey} />}
    </div>
  );
}
