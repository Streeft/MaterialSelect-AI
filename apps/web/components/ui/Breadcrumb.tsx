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
 * Where you are in a hierarchy, and the way back up (P1-4).
 *
 * Three things here are accessibility rather than taste, and each has a wrong
 * version that looks identical on screen:
 *
 * * **The trail is a `<nav>` with a name.** A screen-reader user lands on a
 *   list of links with no idea what they are a list *of*; the landmark and its
 *   label are what say "this is the path to this page".
 * * **The current page is not a link.** It is marked `aria-current="page"` and
 *   rendered as text, because a link back to the page you are on announces a
 *   destination that does not exist. That is why `href` is optional on `Crumb`
 *   rather than required: the shape makes the last step unrepresentable as a
 *   link by accident.
 * * **The separator is `aria-hidden`.** A "/" between every pair is read aloud
 *   as "slash" otherwise, which turns a four-level path into eight
 *   announcements. The `<ol>` already carries the order.
 *
 * Wrapping: a deep taxonomy on a phone is the case this has to survive, so the
 * list wraps and each label may shrink rather than the row scrolling sideways —
 * the page body never scrolls horizontally (the design system's rule).
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
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-x-1.5">
              {index > 0 ? (
                <span aria-hidden className="select-none text-ink-subtle">
                  /
                </span>
              ) : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="truncate rounded-control underline-offset-2 hover:text-brand-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  // The page the reader is on: text, never a link to itself.
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last && "font-medium text-ink")}
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
