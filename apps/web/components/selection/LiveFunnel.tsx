"use client";

import type { RunResult } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { LoadingIndicator } from "@/components/ui";
import { FunnelRow } from "./FunnelRow";

const t = ptBR.selection;

/**
 * The supporting pane of the selection wizard (D-186; m3.material.io ›
 * Foundations › Layout › Canonical layout examples › Supporting pane): the
 * funnel the constraints are cutting, beside the step that edits them.
 *
 * Every number is the live preview the page already asks the backend for —
 * the same run that feeds the action bar's counter, constraints only. This
 * pane only lays it out: no count is derived here, and the bars are widths of
 * the backend's own ratios (ADR 0004). It is not a live region: the counter in
 * the action bar already announces the change, once.
 */
export function LiveFunnel({
  result,
  pending,
  failed,
}: {
  result: RunResult | undefined;
  pending: boolean;
  failed: boolean;
}) {
  return (
    <div className="m3-live-funnel flex flex-col gap-4 rounded-card bg-panel p-5" aria-busy={pending || undefined}>
      <div className="flex flex-col gap-1">
        <h2 className="text-title font-semibold text-ink">{t.live.title}</h2>
        <p className="text-support text-ink-muted">{t.live.hint}</p>
      </div>

      {failed ? (
        <p className="text-support text-danger-fg">{t.counterError}</p>
      ) : !result ? (
        <LoadingIndicator label={t.live.loading} />
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="text-display leading-none tabular-nums text-brand-700">
              {result.final_count}
            </span>
            <span className="text-support text-ink-muted">
              {t.live.remainOf(result.initial_count)}
              {pending ? ` · ${t.counterPending}` : ""}
            </span>
          </p>
          <ol className="space-y-2">
            <FunnelRow
              label={t.initial}
              remaining={result.initial_count}
              initial={result.initial_count}
              eliminated={null}
              tone="neutral"
            />
            {result.funnel.map((step, i) => (
              <FunnelRow
                key={i}
                label={step.label}
                undetermined={step.undetermined ?? null}
                withoutLevel={step.without_level ?? null}
                remaining={step.remaining}
                initial={result.initial_count}
                // What this step removed, from the counts the backend sent.
                eliminated={(result.funnel[i - 1]?.remaining ?? result.initial_count) - step.remaining}
              />
            ))}
          </ol>
          {result.funnel.length === 0 ? (
            <p className="text-support text-ink-muted">{t.live.noLimits}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
