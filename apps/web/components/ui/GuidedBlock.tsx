"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { Button } from "./Button";
import { IconCheck } from "./icons";

export type GuidedBlockState = "active" | "done" | "locked";

/**
 * One block of a step that reveals itself in order (D-85).
 *
 * The screen shows one decision at a time: the block being filled is open, the
 * ones already decided collapse into a one-line summary with "Alterar", and the
 * ones that depend on an earlier answer say what they are waiting for instead
 * of drawing a control that cannot work yet. Nothing is hidden for good —
 * "Alterar" reopens a block, and whatever was typed in it is still there,
 * because the block only hides its content; it never unmounts the state.
 */
export function GuidedBlock({
  title,
  state,
  summary,
  lockedReason,
  onEdit,
  editLabel,
  headingLevel = 3,
  className,
  children,
}: {
  title: ReactNode;
  state: GuidedBlockState;
  /** What was decided, shown when the block is done. */
  summary?: ReactNode;
  /** Why the block cannot be filled yet, shown when locked. */
  lockedReason?: ReactNode;
  onEdit?: () => void;
  editLabel?: string;
  headingLevel?: 2 | 3;
  className?: string;
  children?: ReactNode;
}) {
  const bodyId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      data-state={state}
      className={cn(
        "rounded-card border bg-surface-raised",
        state === "active" ? "border-brand shadow-card" : "border-edge",
        state === "locked" && "bg-surface-sunken",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {state === "done" ? (
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-accent-fg"
          >
            <IconCheck className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <Heading
            className={cn(
              "text-sm font-semibold",
              state === "locked" ? "text-ink-muted" : "text-ink",
            )}
          >
            {title}
            {state === "done" ? <span className="sr-only"> ({ptBR.ui.stepDone})</span> : null}
          </Heading>
          {state === "done" && summary ? (
            <div className="mt-0.5 text-xs text-ink-muted">{summary}</div>
          ) : null}
          {state === "locked" && lockedReason ? (
            <p className="mt-0.5 text-xs text-ink-muted">{lockedReason}</p>
          ) : null}
        </div>
        {state === "done" && onEdit ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onEdit}
            aria-controls={bodyId}
            aria-expanded={false}
          >
            {editLabel ?? ptBR.ui.change}
          </Button>
        ) : null}
      </div>
      <div id={bodyId} hidden={state !== "active"} className="border-t border-edge-subtle p-4">
        {children}
      </div>
    </section>
  );
}
