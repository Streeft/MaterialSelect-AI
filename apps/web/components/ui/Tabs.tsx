"use client";

import { useCallback, useId, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Tabs, styled with MSDS's tab classes (D-77) — not delegated to MSDS's own
 * `Tabs` function, which has two real gaps against what this app already
 * relies on:
 *
 * - **No tab↔panel ARIA link.** MSDS's `Tabs` renders `role="tab"` buttons
 *   with no `id`/`aria-controls`, and a `role="tabpanel"` with no `id`/
 *   `aria-labelledby` — the exact bug `ui.test.tsx`'s "links the selected
 *   tab to a panel that exists" test was written to pin ("the panel used to
 *   be a sibling component with its own id, so `aria-controls` referred to
 *   nothing at all"). Delegating to it as-is would reintroduce that bug.
 * - **No Home/End.** MSDS's `Tabs` only handles ArrowLeft/ArrowRight; this
 *   app's own test (and users navigating by keyboard) expect Home/End to
 *   jump to the first/last tab, same as `md-tabs` gave for free before.
 *
 * So this file keeps its own markup — ids, `aria-controls`/`aria-labelledby`,
 * `tabIndex` roving focus, and the full arrow/Home/End keyboard pattern —
 * and only borrows MSDS's `.msds-tablist`/`.msds-tab`/`.msds-tabpanel`
 * classes for the visual language (the same "classes, not the function"
 * translation D-76 already used for `ButtonLink`, for the same reason: the
 * vendored function's behavior doesn't cover what a real call site needs).
 * What's lost against MSDS's own `Tabs`: the fade-through transition
 * (`useScreenTransition`) and the pointer ripple on each tab — neither is
 * exported from `lib/msds`'s barrel for reuse outside `msds.tsx`, and both
 * are cosmetic, not correctness.
 *
 * The panel stays exactly what it was: a sibling this component owns and
 * renders itself, not a separate `TabPanel` a caller could get the id wrong
 * for — `value` is the only source of truth for which one is selected.
 */

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Optional count or badge shown after the label. */
  meta?: ReactNode;
}

export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  className,
  panelClassName,
  children,
}: {
  label: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  panelClassName?: string;
  /** The selected view. Only this one is rendered — the others do not exist. */
  children: ReactNode;
}) {
  const base = useId();

  const focusTab = useCallback((index: number) => {
    const el = document.getElementById(`${base}-tab-${items[index]?.id}`);
    el?.focus();
  }, [base, items]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = (index + 1) % items.length;
        onChange(items[next]!.id);
        focusTab(next);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        const prev = (index - 1 + items.length) % items.length;
        onChange(items[prev]!.id);
        focusTab(prev);
      } else if (event.key === "Home") {
        event.preventDefault();
        onChange(items[0]!.id);
        focusTab(0);
      } else if (event.key === "End") {
        event.preventDefault();
        const last = items.length - 1;
        onChange(items[last]!.id);
        focusTab(last);
      }
    },
    [items, onChange, focusTab],
  );

  return (
    <>
      <div role="tablist" aria-label={label} className={cn("msds-tablist", className)}>
        {items.map((item, index) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              id={`${base}-tab-${item.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={selected ? `${base}-panel-${item.id}` : undefined}
              tabIndex={selected ? 0 : -1}
              data-active={selected ? "true" : "false"}
              className="msds-tab"
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {item.label}
              {item.meta ? <span className="ml-1.5 text-2xs text-ink-subtle">{item.meta}</span> : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${value}`}
        aria-labelledby={`${base}-tab-${value}`}
        // Focusable on purpose: a panel whose content happens to be plain text
        // would otherwise be unreachable, and the extra stop is what tells a
        // keyboard reader that the arrow keys just changed what is below.
        tabIndex={0}
        className={cn("msds-tabpanel", panelClassName)}
      >
        {children}
      </div>
    </>
  );
}
