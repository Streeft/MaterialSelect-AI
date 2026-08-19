"use client";

import { useCallback, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Tabs with the keyboard behaviour the pattern actually specifies: arrows move
 * between tabs, Home/End jump to the ends, and only the selected tab is in the
 * tab order. A row of buttons styled as tabs traps a keyboard reader into
 * pressing Tab once per view.
 *
 * The panel is a child of this component rather than a separate `TabPanel` the
 * screen places itself. It used to be the latter, and the id that links the two
 * came from a `useId` inside here — which no call site could possibly know, so
 * every tab in the application pointed `aria-controls` at an element that did
 * not exist. Owning both halves is what makes that unrepresentable.
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
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const index = items.findIndex((i) => i.id === value);
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % items.length;
      if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = items.length - 1;
      const target = items[next];
      if (!target) return;
      onChange(target.id);
      // Selection follows focus, so focus has to follow selection too.
      listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${base}-tab-${target.id}`)}`)?.focus();
    },
    [base, items, onChange, value],
  );

  return (
    <>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn("scroll-x flex gap-1 border-b border-edge", className)}
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              id={`${base}-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              // Only the selected panel is in the document, so only the selected
              // tab may claim to control one.
              aria-controls={selected ? `${base}-panel-${item.id}` : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition",
                selected
                  ? "border-brand text-brand"
                  : "border-transparent text-ink-subtle hover:border-edge-strong hover:text-ink",
              )}
            >
              {item.label}
              {item.meta ? (
                <span className="ml-1.5 text-2xs text-ink-subtle">{item.meta}</span>
              ) : null}
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
        className={panelClassName}
      >
        {children}
      </div>
    </>
  );
}
