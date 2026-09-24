"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One option of a radio set drawn as a card — for choices whose meaning needs
 * a sentence next to it (an index and its hypotheses, a synthesis kind and its
 * rule), which a `<select>` cannot show before the choice is made.
 *
 * The description sits *outside* the `<label>` on purpose: a `<label>` only
 * accepts phrasing content, and folding the description into it would drag
 * several lines of prose into the radio's accessible name. It is wired as the
 * description instead, so a screen reader announces the option and then why.
 *
 * The dot is MSDS's `.msds-radio-dot`, driven by the real `<input>` beside it
 * (`input:checked + .msds-radio-dot`), so keyboard selection and the focus
 * ring are the browser's own. The whole card is a click target as well.
 */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  badge,
  children,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const descriptionId = `${id}-desc`;

  return (
    <div
      onClick={() => onChange(value)}
      className={cn(
        "cursor-pointer rounded-card border p-3 transition",
        // The border carries the state, but never alone: the dot is drawn, and
        // the checked option is the one the browser announces.
        checked
          ? "border-brand bg-brand-50 shadow-card"
          : "border-edge-control bg-surface-raised hover:border-brand",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="msds-radio relative mt-px">
          {/* The real input sits exactly over the drawn dot (inline size:
              `.msds-radio input` shrinks it to 1 px and outranks a utility),
              and the dot ignores the pointer — so a click on the dot is a
              click on the radio, for a person and for Playwright's
              hit-target check alike. */}
          <input
            id={id}
            type="radio"
            name={name}
            value={value}
            checked={checked}
            onChange={() => onChange(value)}
            aria-describedby={children ? descriptionId : undefined}
            style={{ inset: 0, width: "100%", height: "100%", margin: 0, cursor: "pointer" }}
          />
          <span className="msds-radio-dot pointer-events-none" aria-hidden="true" />
        </span>
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm font-medium text-ink">
          {title}
        </label>
        {badge}
      </div>
      {children ? (
        <div id={descriptionId} className="mt-1 pl-7">
          {children}
        </div>
      ) : null}
    </div>
  );
}
