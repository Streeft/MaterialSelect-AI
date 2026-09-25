"use client";

import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { useTableDensity } from "@/lib/density";

/**
 * Tables.
 *
 * The provenance table is nine columns wide and this application is expected to
 * work on a phone, so the scroll container is not optional — it is the whole
 * reason these primitives exist. Twelve tables previously shared ten wrappers,
 * which is another way of saying two of them pushed the page sideways.
 *
 * `numeric` on a cell right-aligns it and switches on tabular figures, so a
 * column of measurements lines up on the decimal point instead of ragging.
 */

export function TableScroll({
  label,
  className,
  children,
}: {
  /** Names the region, so a keyboard reader knows what they scrolled into. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  // D-91: every table follows the reader's density choice (`DensityToggle`).
  const density = useTableDensity();
  return (
    <div
      // tabindex makes an overflowing box reachable — and therefore scrollable —
      // by keyboard. Without it the far columns are simply unreachable.
      tabIndex={0}
      role="region"
      aria-label={label}
      // `relative`: an `sr-only` label (position: absolute) inside a cell has
      // this box as its containing block and is clipped by its overflow. Without
      // it the label's containing block was the page, and every badge in a wide
      // table widened the whole document on a phone (990 px at 375, /comparar).
      className={cn(
        "scroll-x relative rounded-card border border-line bg-panel",
        className,
      )}
      data-density={density}
    >
      {children}
    </div>
  );
}

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table {...rest} className={cn("w-full border-collapse text-sm", className)}>
      {children}
    </table>
  );
}

export function THead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      {...rest}
      className={cn(
        // D-91: sentence case, 12 px, secondary ink. Uppercase column heads
        // shouted over the values they name; the small caps are the page
        // header's alone.
        "sticky top-0 z-10 bg-well text-left text-caption text-ink-muted",
        className,
      )}
    >
      {children}
    </thead>
  );
}

export function TBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      {...rest}
      // The row tint is not decoration on a nine-column table: it is the only
      // thing that keeps the eye on one material while it travels from the name
      // in the first column to the value in the last. `colors` only — a row that
      // also scaled would shift every row under it.
      className={cn(
        "divide-y divide-edge-subtle [&>tr:hover]:bg-surface-sunken [&>tr]:transition-colors",
        className,
      )}
    >
      {children}
    </tbody>
  );
}

export function Tr({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr {...rest} className={cn("align-top", className)}>
      {children}
    </tr>
  );
}

export function Th({
  numeric,
  className,
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope={rest.scope ?? "col"}
      data-numeric={numeric ? "" : undefined}
      {...rest}
      className={cn("whitespace-nowrap px-3 py-2 font-semibold", className)}
    >
      {children}
    </th>
  );
}

export function Td({
  numeric,
  className,
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td data-numeric={numeric ? "" : undefined} {...rest} className={cn("px-3 py-2", className)}>
      {children}
    </td>
  );
}

/** Row header — the material's name in a wide table, so the row is nameable. */
export function RowHeader({
  className,
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="row"
      {...rest}
      className={cn("px-3 py-2 text-left font-medium text-ink", className)}
    >
      {children}
    </th>
  );
}

/** `<caption>`, visible or screen-reader-only. Every table should name itself. */
export function TableCaption({
  visible = false,
  className,
  children,
}: {
  visible?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <caption
      className={cn(
        visible ? "px-3 py-2 text-left text-xs text-ink-muted" : "sr-only",
        className,
      )}
    >
      {children}
    </caption>
  );
}
