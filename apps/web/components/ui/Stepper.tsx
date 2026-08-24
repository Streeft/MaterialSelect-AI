"use client";

import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { IconCheck } from "./icons";

/**
 * The wizard's spine.
 *
 * A step is not merely "current or not". It is done, current, reachable, or
 * blocked — and if it is blocked the reader is owed the reason, in words, at
 * the moment they try. The previous stepper was a row of pills that all looked
 * clickable and silently did nothing.
 */

export type StepStatus = "done" | "current" | "upcoming" | "blocked";

export interface Step<T extends string> {
  id: T;
  label: string;
  /** Why this step cannot be opened yet. Required when status is "blocked". */
  blockedReason?: string;
}

export function Stepper<T extends string>({
  label,
  steps,
  statusOf,
  current,
  onSelect,
  className,
}: {
  label: string;
  steps: readonly Step<T>[];
  statusOf: (step: Step<T>, index: number) => StepStatus;
  current: T;
  onSelect: (id: T) => void;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-col gap-1 sm:flex-row sm:items-stretch sm:gap-2">
        {steps.map((step, index) => {
          const status = statusOf(step, index);
          const isCurrent = step.id === current;
          const disabled = status === "blocked";
          return (
            <li key={step.id} className="sm:flex-1">
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                disabled={disabled}
                aria-current={isCurrent ? "step" : undefined}
                title={disabled ? step.blockedReason : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-control border px-3 py-2 text-left text-sm transition",
                  "disabled:cursor-not-allowed",
                  // A step is a button, so its outline is what says it can be
                  // pressed and owes 3:1 (WCAG 1.4.11). The blocked one is
                  // disabled and therefore exempt, but a dashed hairline on the
                  // dark theme's page is invisible rather than merely quiet.
                  isCurrent
                    ? "border-brand bg-brand-50 font-semibold text-brand-700"
                    : status === "done"
                      ? "border-edge-control bg-surface-raised text-ink hover:border-ink-subtle"
                      : status === "blocked"
                        ? "border-dashed border-edge-strong bg-surface-sunken text-ink-subtle"
                        : "border-edge-control bg-surface-raised text-ink-muted hover:border-ink-subtle",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold",
                    status === "done"
                      ? "border-success bg-success-soft text-success-fg"
                      : isCurrent
                        ? "border-brand bg-brand text-brand-fg"
                        : "border-edge-control text-ink-subtle",
                  )}
                >
                  {status === "done" ? <IconCheck className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{step.label}</span>
                  {disabled && step.blockedReason ? (
                    <span className="block text-2xs font-normal text-ink-subtle">
                      {step.blockedReason}
                    </span>
                  ) : null}
                </span>
                {/* Status in words, for a reader who gets no colour and no shape. */}
                <span className="sr-only">
                  {status === "done"
                    ? ` (${ptBR.ui.stepDone})`
                    : status === "blocked"
                      ? ` (${ptBR.ui.stepBlocked}: ${step.blockedReason ?? ""})`
                      : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
