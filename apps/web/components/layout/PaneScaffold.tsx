import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PaneLayout = "list-detail" | "supporting-pane";

/**
 * The two-pane canonical layouts of Material 3 (D-182; m3.material.io ›
 * Foundations › Layout › Canonical layout examples, read 29/10/26).
 *
 * - **list-detail:** a list and the item it opens. Below the "expanded" width
 *   only one pane shows — `focus` says which; from there up both sit side by side.
 * - **supporting-pane:** the work in about two thirds, and what helps read it
 *   beside it. Below "expanded" the supporting pane drops under the main one.
 *
 * The widths are measured on the scaffold itself (CSS container queries), not on
 * the window: the dark sidebar (D-37) is always there from `lg`, so the panes
 * share what is left of the window, and that is what decides whether two fit.
 * The thresholds are the M3 breakpoints of `lib/design/breakpoints.ts`.
 *
 * Both panes are always mounted, whichever one shows: switching focus on a
 * phone keeps a half-typed filter or a scrolled list as it was.
 */
export function PaneScaffold({
  layout,
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  focus = "primary",
  className,
}: {
  layout: PaneLayout;
  primary: ReactNode;
  secondary: ReactNode;
  /** Accessible name of each region; screen readers jump between them. */
  primaryLabel: string;
  secondaryLabel: string;
  /** list-detail only: the pane that shows when only one fits. */
  focus?: "primary" | "secondary";
  className?: string;
}) {
  const Secondary = layout === "supporting-pane" ? "aside" : "section";
  return (
    <div className={cn("m3-scaffold", className)}>
      <div className="m3-scaffold-grid" data-layout={layout} data-focus={focus}>
        <section aria-label={primaryLabel} className="m3-pane m3-pane-primary">
          {primary}
        </section>
        <Secondary aria-label={secondaryLabel} className="m3-pane m3-pane-secondary">
          {secondary}
        </Secondary>
      </div>
    </div>
  );
}
