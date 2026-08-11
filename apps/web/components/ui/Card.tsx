import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The actions slot of a header, in one place because both headers use it.
 *
 * `shrink-0` keeps a long title from squeezing the controls into two-letter
 * columns. On its own it also let the controls push the whole document wider
 * than the viewport: at 375 px the catalogue's three export links stretched the
 * page to 389 px and every route inherited the sideways scroll. `max-w-full`
 * caps the slot at the line it sits on and `flex-wrap` gives its children a
 * second row — the controls stay unsqueezed, and the page stops growing.
 */
const ACTIONS = "flex max-w-full shrink-0 flex-wrap items-center gap-2";

/** A raised panel. The default container for anything that is not prose. */
export function Card({
  as: Tag = "div",
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-edge bg-surface-raised shadow-card",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  headingLevel = 3,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Controls that belong to this card, not to the page. */
  actions?: ReactNode;
  className?: string;
  /**
   * Where this card sits in the document outline. Defaults to `h3` because a
   * card normally lives inside a `Section` (`h2`); a card placed directly under
   * the page title has to say `2`, or the outline skips a level and the page
   * stops being navigable by headings.
   */
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as ElementType;
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-edge-subtle px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className="text-sm font-semibold text-ink">{title}</Heading>
        {description ? (
          <p className="mt-0.5 max-w-prose text-xs text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className={ACTIONS}>{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-4", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle bg-surface-sunken px-4 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A titled region of a page, with a stable anchor.
 *
 * The results screen is long and gets referenced in class ("look at the funnel"),
 * so every block needs an id someone can link to — and a real heading, so the
 * document outline matches what the eye sees.
 *
 * `min-w-0` because a section is nearly always a grid or flex item, and such an
 * item defaults to `min-width: auto`: it refuses to shrink below the widest
 * thing inside it. One wide table then pushes the whole page past the viewport
 * instead of scrolling inside its own box.
 */
export function Section({
  id,
  title,
  description,
  actions,
  className,
  headingLevel = 2,
  children,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = (headingLevel === 2 ? "h2" : "h3") as ElementType;
  return (
    <section id={id} className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <Heading
            className={cn(
              "font-semibold text-ink",
              headingLevel === 2 ? "text-lg" : "text-base",
            )}
          >
            {title}
          </Heading>
          {description ? (
            <p className="mt-0.5 max-w-prose text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className={ACTIONS}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
