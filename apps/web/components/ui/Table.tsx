import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

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
  return (
    <div
      // tabindex makes an overflowing box reachable — and therefore scrollable —
      // by keyboard. Without it the far columns are simply unreachable.
      tabIndex={0}
      role="region"
      aria-label={label}
      className={cn(
        "scroll-x rounded-card border border-edge bg-surface-raised",
        className,
      )}
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
        "sticky top-0 z-10 bg-surface-sunken text-left text-2xs uppercase tracking-wide text-ink-subtle",
        className,
      )}
    >
      {children}
    </thead>
  );
}

export function TBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody {...rest} className={cn("divide-y divide-edge-subtle", className)}>
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
export function ThRow({
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
