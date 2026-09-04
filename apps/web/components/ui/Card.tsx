import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A header's action slot, in one place because both headers use it.
 *
 * `shrink-0` prevents a long title from squeezing controls into two-letter columns.
 * Alone it also let controls push the document past viewport: at 375px the three
 * catalog export links stretched the page to 389px and every route inherited sideways
 * scroll. `max-w-full` limits the slot to its line and `flex-wrap` gives children
 * a second row.
 */
const ACTIONS = "flex max-w-full shrink-0 flex-wrap items-center gap-2";

/**
 * The ceiling of staggered entry. From the seventh item onward everything enters
 * together: past that the screen takes longer to settle than the reader takes to
 * look, and animation shifts from explanation to waiting.
 */
const STAGGER_LIMIT = 6;
const STAGGER_STEP = 40;

/** A raised panel. The default container for everything that isn't prose. */
export function Card({
  as: Tag = "div",
  className,
  children,
  riseIndex,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  /**
   * The card's position in a grid, when the grid should enter staggered.
   * Omit for a lone card: a single element rising alone explains nothing,
   * just arrives late.
   */
  riseIndex?: number;
}) {
  const staggered = riseIndex != null && riseIndex < STAGGER_LIMIT;
  return (
    <Tag
      className={cn(
        "rounded-card border border-edge bg-surface-raised shadow-card",
        riseIndex != null && "rise",
        className,
      )}
      style={staggered ? { animationDelay: `${riseIndex * STAGGER_STEP}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * The frame of an entire route: larger radius, so the screen reads as its own
 * surface, not a giant card.
 *
 * Exists for each route's shell — the `<main>` and what surrounds it —
 * and is the only place `rounded-panel` appears.
 */
export function PanelShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-panel bg-surface", className)}>{children}</div>
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
  /** Controls of this card, not the page. */
  actions?: ReactNode;
  className?: string;
  /**
   * Where this card falls in the document outline. Default `h3`, because a card
   * normally lives inside a `Section` (`h2`); a card placed directly
   * under the page title must say `2`, or the outline skips a level and the
   * page becomes non-navigable by heading.
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
 * A titled page region with stable anchor.
 *
 * The results screen is long and referenced in class ("look at the funnel"), so
 * every block needs a linkable id — and a real heading, so the
 * document outline matches what the eye sees.
 *
 * `min-w-0` because a section is almost always a grid or flex item, and such an item
 * assumes `min-width: auto`: refuses to shrink below its widest child.
 * A wide table then pushes the entire page past viewport
 * instead of scrolling in its own box.
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
