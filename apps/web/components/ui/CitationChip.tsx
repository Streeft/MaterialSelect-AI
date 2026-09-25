"use client";

import type { ReactNode } from "react";
import { Popover } from "./Popover";

/**
 * A citation as a small numbered chip that opens the passage it points at.
 *
 * On top of {@link Popover}, so it is click- and keyboard-reachable, closes on
 * Escape and survives sitting inside a paragraph (the panel is portalled). The
 * chip's accessible name says which passage and which source — a bare "2"
 * announced by a screen reader would mean nothing.
 */
export function CitationChip({
  number,
  label,
  title,
  locator,
  children,
}: {
  number: number;
  /** Accessible name: "Trecho 2, de “Apostila de metais”". */
  label: string;
  /** The source's title, shown at the top of the panel. */
  title: string;
  /** Section and page, when known. */
  locator?: string | null;
  /** The passage itself. */
  children: ReactNode;
}) {
  return (
    <Popover
      label={label}
      className="mx-0.5 align-baseline"
      panelClassName="max-h-80"
      trigger={
        <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-brand-100 px-1.5 text-2xs font-semibold tabular-nums text-brand-800">
          {number}
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-ink">{title}</p>
        {locator ? <p className="text-2xs text-ink-muted">{locator}</p> : null}
        <blockquote className="whitespace-pre-line border-l-2 border-brand-300 pl-2 text-xs text-ink">
          {children}
        </blockquote>
      </div>
    </Popover>
  );
}
