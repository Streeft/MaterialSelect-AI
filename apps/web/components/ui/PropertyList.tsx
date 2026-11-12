import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PropertyItem {
  /** Stable key; the label when omitted. */
  id?: string;
  label: ReactNode;
  /** The value as the caller renders it — `ValueText`, a badge, a link. Never a bare dash (D-24). */
  value: ReactNode;
  /** A line under the value: a source, a condition, a unit note. */
  hint?: ReactNode;
  /** Sits at the end of the row: a quality badge, a provenance popover. */
  aside?: ReactNode;
}

/**
 * D-206: name → value pairs, aligned, Notion's page properties in a `<dl>`.
 *
 * The left column is the property's name at caption weight, the right its
 * value at body size, and an optional aside (quality, provenance) at the end
 * of the row. Below 480 px of its own width the pair stacks, name above value,
 * by container query (D-182: layout follows the block, not the window).
 *
 * The list formats nothing. A value arrives already written by whoever owns
 * it (`ValueText` writes the unit, the pt-BR comma and the missing state), so a
 * property cannot look different here from how it looks on its sheet.
 */
export function PropertyList({
  items,
  className,
  dense = false,
}: {
  items: readonly PropertyItem[];
  className?: string;
  /** Tighter rows, for a side panel. */
  dense?: boolean;
}) {
  return (
    <div className={cn("ds-props", className)}>
      <dl className={cn("ds-props-list", dense && "ds-props-dense")}>
        {items.map((item, index) => (
          <div
            key={item.id ?? (typeof item.label === "string" ? item.label : index)}
            className="ds-props-row"
          >
            <dt className="text-caption font-medium text-ink-muted">{item.label}</dt>
            <dd className="min-w-0 text-body text-ink">
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="min-w-0">{item.value}</span>
                {item.aside ? <span className="ms-auto shrink-0">{item.aside}</span> : null}
              </span>
              {item.hint ? (
                <span className="mt-0.5 block text-caption text-ink-muted">{item.hint}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
