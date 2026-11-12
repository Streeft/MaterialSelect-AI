"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { describeApiError, describeApiErrorTitle } from "@/lib/errors";
import { useOnline } from "@/lib/useOnline";
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

/**
 * The shape of a list that is on its way (D-130): rows or cards in the places
 * the real ones will land, so the page does not jump when they arrive. It says
 * "Carregando" once, to a screen reader, and keeps its pieces silent — a status
 * region that is a spinner and nothing else tells nobody what is coming.
 */
export function ListSkeleton({
  variant = "rows",
  count,
  label = ptBR.ui.loading,
  className,
}: {
  variant?: "rows" | "cards";
  count?: number;
  label?: string;
  className?: string;
}) {
  const n = count ?? (variant === "cards" ? 6 : 3);
  return (
    <div role="status" aria-live="polite" aria-label={label} className={className}>
      <ul
        aria-hidden
        className={
          variant === "cards"
            ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "flex flex-col gap-2"
        }
      >
        {Array.from({ length: n }, (_, i) => (
          <li key={i}>
            <Skeleton className={variant === "cards" ? "h-32 w-full" : "h-12 w-full"} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The shape of what is coming, by kind (D-209): a table, a chart or a sheet of
 * figures. Each says what it is loading once, to a screen reader and on screen
 * (the label stays visible, as `LoadingState`'s does — a grey box alone tells
 * nobody what is on its way), and its pieces stay silent. The boxes keep the
 * height of the real thing, so the page does not jump when it lands.
 */
function SkeletonFrame({
  kind,
  label,
  className,
  children,
}: {
  kind: "table" | "chart" | "sheet";
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-skeleton={kind}
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <span className="text-support text-ink-muted">{label}</span>
      <div aria-hidden className="flex min-w-0 flex-col gap-2">
        {children}
      </div>
    </div>
  );
}

/** A table on its way: a header row and `rows` body rows. */
export function TableSkeleton({
  rows = 5,
  columns = 4,
  label = ptBR.ui.loadingTable,
  className,
}: {
  rows?: number;
  columns?: number;
  label?: string;
  className?: string;
}) {
  const row = (height: string, key: number) => (
    <div
      key={key}
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: columns }, (_, c) => (
        <Skeleton key={c} className={height} />
      ))}
    </div>
  );
  return (
    <SkeletonFrame kind="table" label={label} className={className}>
      {row("h-4", -1)}
      {Array.from({ length: rows }, (_, r) => row("h-8", r))}
    </SkeletonFrame>
  );
}

/** A chart on its way: the plot area and a legend line. */
export function ChartSkeleton({
  label = ptBR.ui.loadingChart,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <SkeletonFrame kind="chart" label={label} className={className}>
      <Skeleton className="h-64 w-full" />
      <div className="flex gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-24" />
      </div>
    </SkeletonFrame>
  );
}

/** A sheet of figures on its way: a title and a row of tiles. */
export function SheetSkeleton({
  tiles = 4,
  label = ptBR.ui.loadingSheet,
  className,
}: {
  tiles?: number;
  label?: string;
  className?: string;
}) {
  return (
    <SkeletonFrame kind="sheet" label={label} className={className}>
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: tiles }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </SkeletonFrame>
  );
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
  title,
  description,
  error,
  onRetry,
  className,
}: {
  title?: string;
  description?: ReactNode;
  /**
   * The thrown value of a failed query or mutation (D-200). Passing it, instead
   * of its `.message`, is what keeps "Failed to fetch" and server details off
   * the screen: the text is chosen by kind of failure in `describeApiError`.
   */
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  // D-168: with no connection the failure has one honest cause, so the default
  // wording says it. A caller that passes its own title keeps it.
  const online = useOnline();
  const offlineDefault = !online && title === undefined;
  if (error !== undefined && error !== null) {
    title = title ?? describeApiErrorTitle(error);
    description = description ?? describeApiError(error);
  }
  return (
    <div role="alert" className={className}>
      <MsdsErrorState
        title={title ?? (offlineDefault ? ptBR.offline.errorTitle : ptBR.ui.errorTitle)}
        description={description ?? (offlineDefault ? ptBR.offline.errorDescription : undefined)}
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
