"use client";

import { useCallback, useId, type ReactNode } from "react";
import { MdPrimaryTab, MdTabs } from "./material/elements";

/**
 * Tabs, on top of @material/web's md-tabs + md-primary-tab.
 *
 * md-tabs already implements the keyboard pattern this component used to
 * hand-roll: arrow keys move focus, Home/End jump to the ends, and only the
 * active tab sits in the tab order. `autoActivate` is the one property this
 * call site turns on — without it, arrow keys only move focus (the "manual
 * activation" ARIA pattern, Enter/Space required to commit a selection), and
 * this app's existing behaviour and tests expect selection to follow focus
 * immediately, the same as before.
 *
 * The panel stays exactly what it was: a sibling this component owns and
 * renders itself, not a separate `TabPanel` a caller could get the id wrong
 * for. `md-tabs` has no concept of a panel at all — selection is purely
 * index-based (`activeTabIndex`), so `value` is translated to/from an index
 * at the boundary here.
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
  const activeTabIndex = items.findIndex((item) => item.id === value);

  const handleChange = useCallback(
    (event: Event) => {
      const activeTabIndex = (event.target as unknown as { activeTabIndex: number }).activeTabIndex;
      const next = items[activeTabIndex];
      if (next) onChange(next.id);
    },
    [items, onChange],
  );

  return (
    <>
      <MdTabs
        aria-label={label}
        autoActivate
        activeTabIndex={activeTabIndex}
        onChange={handleChange}
        className={className}
      >
        {items.map((item) => (
          <MdPrimaryTab
            key={item.id}
            id={`${base}-tab-${item.id}`}
            // Only the selected panel is in the document, so only the
            // selected tab may claim to control one.
            aria-controls={item.id === value ? `${base}-panel-${item.id}` : undefined}
          >
            {item.label}
            {item.meta ? <span className="ml-1.5 text-2xs text-ink-subtle">{item.meta}</span> : null}
          </MdPrimaryTab>
        ))}
      </MdTabs>
      <div
        role="tabpanel"
        id={`${base}-panel-${value}`}
        aria-labelledby={`${base}-tab-${value}`}
        // Focusable on purpose: a panel whose content happens to be plain text
        // would otherwise be unreachable, and the extra stop is what tells a
        // keyboard reader that the arrow keys just changed what is below.
        tabIndex={0}
        className={panelClassName}
      >
        {children}
      </div>
    </>
  );
}
