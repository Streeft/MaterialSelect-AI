"use client";

import type { ReactNode } from "react";
import { PaneScaffold } from "@/components/layout/PaneScaffold";
import { ptBR } from "@/lib/i18n";

const t = ptBR.selection;

/** The action bar's live count: how many candidates the limits leave (D-85). */
export function CandidateCounter({
  count,
  total,
  pending,
  failed,
  className,
}: {
  count: number | null;
  total: number | null;
  pending: boolean;
  failed: boolean;
  className?: string;
}) {
  return (
    <div
      aria-live="polite"
      className={
        "flex shrink-0 items-baseline gap-1.5 rounded-control bg-well px-2.5 py-1.5 sm:gap-2 sm:px-3 " +
        (className ?? "")
      }
    >
      {/* D-91: one word on a phone, so the counter and the step's buttons
          share one line of the action bar. */}
      <span className="text-caption font-medium text-ink-muted">
        <span className="sm:hidden">{t.remainingShort}</span>
        <span className="hidden sm:inline">{t.remaining}</span>
      </span>
      {failed ? (
        <span className="text-caption text-danger-fg">{t.counterError}</span>
      ) : count === null || total === null ? (
        <span className="text-caption text-ink-muted">{t.counterPending}</span>
      ) : (
        <>
          <span className="text-lg font-semibold leading-none tabular-nums text-brand-700">
            {count}
          </span>
          <span className="text-2xs text-ink-muted">
            {t.of} {total}
            {pending ? ` · ${t.counterPending}` : ""}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * D-186: the input steps sit in the M3 supporting-pane layout, the funnel beside
 * them (under them on a narrow block). Results have their own funnel, so they
 * take the whole width.
 */
export function StepPanes({
  withFunnel,
  funnel,
  children,
}: {
  withFunnel: boolean;
  funnel: ReactNode;
  children: ReactNode;
}) {
  if (!withFunnel) return <div className="space-y-4">{children}</div>;
  return (
    <PaneScaffold
      layout="supporting-pane"
      primary={<div className="space-y-4">{children}</div>}
      secondary={funnel}
      primaryLabel={t.live.main}
      secondaryLabel={t.live.region}
    />
  );
}
