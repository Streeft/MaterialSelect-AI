import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { IconInfo } from "./icons";
import { Button } from "./Button";
import { CircularProgress as MsdsCircularProgress, ErrorState as MsdsErrorState } from "@/lib/msds";

/**
 * Loading, empty and error are states of the same screen, not afterthoughts.
 * They live together here so a route cannot ship one and forget the others —
 * the convention in docs/CLAUDE.md that these are always handled only holds if
 * handling them is cheaper than not.
 *
 * D-78: `Spinner` now renders MSDS's `CircularProgress` (indeterminate)
 * instead of `@material/web`'s `MdCircularProgress` — this removes the
 * file's only `@material/web` import. `Skeleton` keeps its own markup/props
 * (`className` still drives size) and only swaps the animation for MSDS's
 * shimmer (`.msds-skeleton`). `LoadingState` is **not** delegated to MSDS's
 * own `LoadingState`: that one renders three fixed skeleton rows and never
 * shows a visible label (only `aria-label`), while ~29 real call sites here
 * pass a visible `label` that must stay on screen — losing it would be the
 * same class of regression D-24 forbids for missing data, applied to a
 * loading state instead.
 *
 * `ErrorState` *is* delegated to MSDS — its `title`/`description` line up
 * directly, and MSDS's `action` slot takes the `Button` this file already
 * builds from `onRetry`. One thing MSDS's version does not carry, restored
 * here: `role="alert"` (MSDS's own markup sets no role at all).
 *
 * `EmptyState`, by contrast, was tried against MSDS's delegated version and
 * **reverted** — a real defect, not a style preference. MSDS's `EmptyState`
 * always draws its own decorative `EmptyStateArt` SVG, whose three shapes
 * are filled with `var(--brand-100)`/`var(--brand-300)`/`var(--accent)`
 * used bare as `fill` values. This app's tokens (`app/globals.css`) are
 * unitless `"R G B"` triples meant to be read through `rgb(var(--x))` — a
 * bare `var(--brand-100)` is not a valid CSS color, so the SVG silently
 * falls back to solid black in both themes (confirmed live, system
 * Chromium, `/app/estilo`'s feedback showcase, light and dark). Rather than
 * ship a black blob in ~23 real `EmptyState` call sites, this keeps the
 * app's own markup/icon (`IconInfo` by default, or the caller's `icon`) and
 * only borrows MSDS's `.msds-state`/`.msds-state-title`/`.msds-state-desc`
 * layout classes for the icon-left/text-right shell, matching `ErrorState`'s
 * new look without going through the broken art.
 */

export function Spinner({ className, label }: { className?: string; label?: string }) {
  // MSDS's `CircularProgress` only ever reads `size`/`strokeWidth`/`value`/
  // `label`/`showValue` off its props object (see `lib/msds/msds.tsx`) — an
  // `aria-hidden` passed to it would be silently dropped, leaving an
  // unnamed `role="progressbar"` in the tree when there's no label. Setting
  // `aria-hidden` on this wrapping `<span>` instead removes the whole
  // subtree from the accessibility tree, the same outcome the old
  // `MdCircularProgress aria-hidden` achieved directly.
  return (
    <span
      className={cn("inline-flex align-[-0.125em]", className)}
      aria-hidden={label ? undefined : true}
    >
      <MsdsCircularProgress size={16} strokeWidth={2} label={label} />
    </span>
  );
}

/** Placeholder box with the shape of the content that is coming. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block msds-skeleton", className)} />;
}

export function LoadingState({
  label = ptBR.ui.loading,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-2 py-8 text-sm text-ink-muted", className)}
    >
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorState({
  title = ptBR.ui.errorTitle,
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={className}>
      <MsdsErrorState
        title={title}
        description={description}
        action={
          onRetry ? (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              {ptBR.ui.retry}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("msds-state", className)}>
      {/* Not `.msds-state-icon`: that class hardcodes `color: rgb(var(--danger))`
          for the error variant, which would tint a neutral empty-state icon red. */}
      <span className="shrink-0 text-ink-subtle" aria-hidden="true">
        {icon ?? <IconInfo className="h-6 w-6" />}
      </span>
      <div>
        <div className="msds-state-title">{title}</div>
        {description ? <div className="msds-state-desc">{description}</div> : null}
        {action ? <div style={{ marginTop: "10px" }}>{action}</div> : null}
      </div>
    </div>
  );
}
