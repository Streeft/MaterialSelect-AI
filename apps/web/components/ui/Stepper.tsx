"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { IconCheck } from "./icons";

/**
 * The wizard's spine, restyled with MSDS's step tokens (D-77) — not
 * delegated to MSDS's own `Stepper` function (`lib/msds/msds.tsx`).
 *
 * MSDS's `Stepper` is a read-only `<ol>`: no `<button>`, no `onClick`, no
 * way for a reader to jump to a step at all — it only ever displays where
 * the wizard is. This app's `Stepper` is interactive on purpose
 * (`onSelect`, used by both real call sites, `/app/selecao` and
 * `/app/importar`, to let a reader jump back to a completed step or forward
 * to one already reachable) — delegating to MSDS's version outright would
 * drop that navigation entirely, a real functional regression, not a
 * cosmetic one. It is also a strictly vertical timeline (a connecting line
 * between dots via `::before`, sized for a column), where this app's own
 * layout is a responsive row of equal-width steps above the wizard's
 * content — swapping the whole markup for MSDS's would either break that
 * layout or force a page redesign neither this pass nor its budget covers.
 *
 * So this file keeps its own interactive `<button>`-per-step structure —
 * click, `disabled` on a blocked step, `aria-current="step"`, the `title`/
 * sr-only text a colour- or shape-blind reader needs — and only takes
 * MSDS's `.msds-step-dot`/`.msds-step-label`/`.msds-step-blocked` classes
 * (and their `data-state` colour rules) for the step marker's visual
 * language, in place of the bespoke Tailwind colour classes this file used
 * to hand-pick per status.
 */

export type StepStatus = "done" | "current" | "upcoming" | "blocked";

export interface Step<T extends string> {
  id: T;
  label: string;
  /** Why this step cannot be opened yet. Required when status is "blocked". */
  blockedReason?: string;
}

/**
 * MSDS's own colour rule for the dot is `.msds-step[data-state=…]
 * .msds-step-dot` (`msds.css`) — a cascade from a `.msds-step` ancestor this
 * file doesn't use (see the file doc comment: applying that class to the
 * `<li>` would also pull in its `position: relative`/`padding-bottom`/
 * `::before` vertical-connector rules, sized for MSDS's own column layout,
 * into this file's responsive row). The same four colours it expresses are
 * reproduced here instead, as inline styles rather than Tailwind classes —
 * `msds.css` is imported after `globals.css` (`app/layout.tsx`, so its own
 * token bridge is in place first), which means it wins a same-specificity
 * class-vs-class cascade fight against a Tailwind utility for the border
 * colour `.msds-step-dot` itself already sets; an inline style is the one
 * thing source order can't override.
 */
function stepDotStyle(status: StepStatus): CSSProperties {
  if (status === "done") {
    return { borderColor: "rgb(var(--success))", background: "rgb(var(--success))", color: "rgb(var(--accent-fg))" };
  }
  if (status === "current") {
    return { borderColor: "rgb(var(--accent))", background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" };
  }
  if (status === "blocked") {
    return { borderColor: "rgb(var(--warning))", borderStyle: "dashed", color: "rgb(var(--warning-fg))" };
  }
  return {};
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
                    ? "border-brand bg-brand-50"
                    : status === "done"
                      ? "border-edge-control bg-surface-raised hover:border-ink-subtle"
                      : status === "blocked"
                        ? "border-dashed border-edge-strong bg-surface-sunken"
                        : "border-edge-control bg-surface-raised hover:border-ink-subtle",
                )}
              >
                <span className="msds-step-dot" style={stepDotStyle(status)} aria-hidden="true">
                  {status === "done" ? <IconCheck className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="msds-step-label block truncate">{step.label}</span>
                  {disabled && step.blockedReason ? (
                    <span className="msds-step-blocked block truncate">{step.blockedReason}</span>
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
