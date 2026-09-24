"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/** One step of the trail. The last one is where the reader is. */
export interface Crumb {
  label: string;
  /** Omitted on the current page — see the component's note. */
  href?: string;
}

/**
 * Where you are in a hierarchy, and the way back up (P1-4), restyled with
 * MSDS's breadcrumb classes (D-77) — not delegated to MSDS's own
 * `Breadcrumb` function (`lib/msds/msds.tsx`).
 *
 * MSDS's `Breadcrumb` takes `onClick` per item and renders every non-current
 * crumb as `<a href="#" onClick={(e) => { e.preventDefault(); it.onClick() }}>`
 * — never a real navigable link. Every real call site in this app
 * (`app/app/catalogo/[slug]`, `app/app/processos/[slug]`,
 * `app/app/processos/familia/[slug]`) passes `href`, not `onClick`, and
 * relies on that `href` being a real link — middle-click, "open in new tab",
 * `next/link` prefetch-on-visible, all the things a fake `href="#"` breaks.
 * MSDS's version is also a flat sequence of `<a>`/`<span>` with no `<ol>`, so
 * a screen reader gets no "this is a list of N steps" — and it hardcodes its
 * own `aria-label` ("Trilha de navegação"), ignoring a caller's `label`
 * entirely, which happens to match this component's own default but would
 * silently stop tracking it if the default ever changed here.
 *
 * So the `<nav>`/`<ol>`/`<li>` structure, the real `next/link` navigation,
 * and the customizable landmark label all stay exactly what they were; only
 * `.msds-breadcrumb`/`.msds-breadcrumb-link`/`.msds-breadcrumb-current`/
 * `.msds-breadcrumb-sep` (`msds.css`) replace the Tailwind classes this file
 * used to hand-pick for the same look.
 */
export function Breadcrumb({
  items,
  label = "Trilha de navegação",
  className,
}: {
  items: Crumb[];
  /** The landmark's accessible name. */
  label?: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ol className="msds-breadcrumb flex-wrap gap-y-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-x-1.5">
              {index > 0 ? (
                <span aria-hidden className="msds-breadcrumb-sep select-none">
                  /
                </span>
              ) : null}
              {item.href && !last ? (
                <Link href={item.href} className="msds-breadcrumb-link truncate">
                  {item.label}
                </Link>
              ) : (
                <span
                  // The page the reader is on: text, never a link to itself.
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last ? "msds-breadcrumb-current" : "msds-breadcrumb-link")}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
