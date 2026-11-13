"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ToolTone = "brand" | "info" | "success" | "warning" | "danger";

/**
 * One tool of a grid (the notebook's Studio): a quiet tile with its glyph and
 * name. D-235: the tiles are monochrome — the glyph tells them apart, and
 * colour is kept for state (a tool not ready yet). `tone` is still accepted so
 * older call sites compile; it no longer paints the tile.
 *
 * A tool that is not ready yet stays visible, marked with a written badge and
 * `aria-disabled` rather than `disabled`: it remains focusable, so a keyboard
 * reader finds it and hears why it does nothing, instead of it vanishing from
 * the tab order without a word.
 */
export function ToolTile({
  icon,
  label,
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
        "m3-state bg-surface-container-low text-ink",
        unavailable && "cursor-not-allowed opacity-70",
      )}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="shrink-0 text-ink-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        {badge ? (
          <span className="rounded-full bg-surface px-1.5 py-0.5 text-2xs font-medium text-ink-muted">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-caption font-semibold leading-tight">{label}</span>
      {description ? <span className="sr-only">{description}</span> : null}
    </button>
  );
}
