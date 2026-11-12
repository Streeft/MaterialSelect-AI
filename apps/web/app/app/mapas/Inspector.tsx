"use client";

import { useId, type ReactNode } from "react";
import { IconChevronDown } from "@/components/ui/icons";

/**
 * D-220: one section of the map's inspector — a heading that is a button
 * (Figma's right panel, M3's expandable list item), its body mounted only while
 * open. The summary line says what a folded section holds, so closing one never
 * hides that it is in use ("Escala linear", "2 classes").
 */
export function InspectorSection({
  title,
  summary,
  open,
  onOpenChange,
  headingId,
  children,
}: {
  title: string;
  /** One line under a folded heading: what is set in there. */
  summary?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The heading's own id, for a region that is labelled by it. */
  headingId?: string;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <section className="ds-inspector-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="m-0">
        <button
          type="button"
          className="ds-inspector-head m3-state"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => onOpenChange(!open)}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-semibold text-ink">{title}</span>
            {!open && summary ? (
              <span className="truncate text-caption text-ink-muted">{summary}</span>
            ) : null}
          </span>
          <IconChevronDown aria-hidden className="h-4 w-4 shrink-0 text-ink-muted" />
        </button>
      </h2>
      {open ? (
        <div id={bodyId} className="ds-inspector-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
