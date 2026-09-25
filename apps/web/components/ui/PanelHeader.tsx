"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./Button";
import { IconPanelLeft } from "./icons";

/**
 * The title bar of a collapsible side panel: its name, its own actions, and
 * the button that folds it away. The toggle names the panel and says which
 * way it goes ("Recolher Fontes"), and `aria-expanded`/`aria-controls` tie it
 * to the region it hides — a collapsed panel keeps its header, so it can
 * always be opened again.
 */
export function PanelHeader({
  title,
  headingId,
  expanded,
  onToggle,
  toggleLabel,
  controls,
  actions,
  side = "start",
  toggleClassName,
  className,
}: {
  title: string;
  headingId: string;
  expanded: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
  /** Id of the region the toggle hides. */
  controls?: string;
  actions?: ReactNode;
  /** Which edge the panel sits on; the toggle glyph mirrors for the end side. */
  side?: "start" | "end";
  /** E.g. `hidden lg:inline-flex` where the panel only folds on wide screens. */
  toggleClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-2 border-b border-edge-subtle px-3 py-2",
        !expanded && "justify-center border-b-0",
        className,
      )}
    >
      <h2
        id={headingId}
        className={cn("min-w-0 flex-1 truncate text-sm font-semibold text-ink", !expanded && "sr-only")}
      >
        {title}
      </h2>
      {expanded && actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      {onToggle && toggleLabel ? (
        <IconButton
          size="sm"
          className={toggleClassName}
          label={toggleLabel}
          aria-expanded={expanded}
          aria-controls={controls}
          onClick={onToggle}
          icon={<IconPanelLeft className={cn(side === "end" && "-scale-x-100")} />}
        />
      ) : null}
    </div>
  );
}
