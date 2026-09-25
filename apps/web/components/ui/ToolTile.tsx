"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ToolTone = "brand" | "info" | "success" | "warning" | "danger";

const TONES: Record<ToolTone, string> = {
  brand: "bg-brand-50 text-brand-800",
  info: "bg-info-soft text-info-fg",
  success: "bg-success-soft text-success-fg",
  warning: "bg-warning-soft text-warning-fg",
  danger: "bg-danger-soft text-danger-fg",
};

/**
 * One tool of a grid (the notebook's Studio): a soft tile with its glyph and
 * name. Colour tells tiles apart at a glance and never carries meaning alone —
 * the name is always written.
 *
 * A tool that is not ready yet stays visible, marked with a written badge and
 * `aria-disabled` rather than `disabled`: it remains focusable, so a keyboard
 * reader finds it and hears why it does nothing, instead of it vanishing from
 * the tab order without a word.
 */
export function ToolTile({
  icon,
  label,
  tone = "brand",
  badge,
  unavailable,
  description,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tone?: ToolTone;
  badge?: string;
  unavailable?: boolean;
  /** Read after the name — why the tool is unavailable, or what it makes. */
  description?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-disabled={unavailable || undefined}
      title={description}
      onClick={unavailable ? undefined : onClick}
      className={cn(
        "pressable flex min-h-[4.25rem] flex-col items-start justify-between gap-2 rounded-card p-3 text-left transition",
        TONES[tone],
        unavailable ? "cursor-not-allowed opacity-70" : "hover:shadow-glow",
      )}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        {badge ? (
          <span className="rounded-full bg-surface px-1.5 py-0.5 text-2xs font-medium text-ink-muted">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-xs font-semibold leading-tight">{label}</span>
      {description ? <span className="sr-only">{description}</span> : null}
    </button>
  );
}
