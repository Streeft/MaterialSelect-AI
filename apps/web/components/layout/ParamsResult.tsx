import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";

/**
 * Parameters on the left, the answer on the right (D-209) — the Onshape
 * feature panel beside its model. Every calculator of the app (Dimensionar,
 * Custo, Eco, Baterias, Sintetizar) has the same two halves: what the reader
 * types and what the backend answers. Side by side, changing a number and
 * reading what moved costs no scroll; on a phone the result drops under the
 * parameters, in reading order.
 *
 * Like `PaneScaffold` (D-182), the split is decided by the block's own width
 * (a container query, `.m3-scaffold`), never by the window's: the dark rail
 * takes its share from `lg`. Two columns from 1200 px of block ("large" in
 * `lib/design/breakpoints.ts`), because both halves hold forms and tables that
 * a narrower split would squeeze.
 *
 * It is layout only: no state, no logic, and the two landmarks are named so a
 * screen reader can jump from the inputs to the answer.
 */
export function ParamsResultLayout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("m3-scaffold", className)}>
      <div className="m3-scaffold-grid" data-layout="params-result">
        {children}
      </div>
    </div>
  );
}

/** The left half: the inputs, as a stack of step cards. */
export function ParamsPanel({
  children,
  label = ptBR.ui.paramsPanel,
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <section aria-label={label} className={cn("m3-pane m3-pane-primary flex flex-col gap-6", className)}>
      {children}
    </section>
  );
}

/**
 * The right half: what the backend answered. `sticky` keeps a short answer in
 * view while a long form scrolls past it; leave it off when the answer itself
 * can be taller than the window (a sticky box taller than the screen hides its
 * own bottom until the form ends).
 */
export function ResultPanel({
  children,
  label = ptBR.ui.resultPanel,
  sticky = false,
  className,
}: {
  children: ReactNode;
  label?: string;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      data-sticky={sticky || undefined}
      className={cn("m3-pane m3-pane-secondary flex flex-col gap-6", className)}
    >
      {children}
    </section>
  );
}
