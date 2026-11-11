"use client";

import type { ReactNode } from "react";
import Link from "next/link";
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
      className={cn("flex items-center gap-2 py-8 text-body text-ink-muted", className)}
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

export interface EmptyTemplate {
  label: string;
  description?: string;
  /** A link (a study pre-filled by URL) or a handler; one of the two. */
  href?: string;
  onSelect?: () => void;
}

/**
 * D-206: "EmptyState v2". The inline form (one line in a card) stays the
 * default; `layout="page"` is the empty state of a whole screen — a quiet
 * glyph in a tonal circle, one sentence, the right action and, when there are
 * any, starting points (`templates`), as Notion's empty page offers templates
 * instead of a blank. A template is a link or a button, never a value: it
 * opens a screen already set up, and the numbers still come from the server.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  templates,
  layout = "inline",
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  templates?: readonly EmptyTemplate[];
  layout?: "inline" | "page";
  className?: string;
}) {
  const starts =
    templates && templates.length > 0 ? (
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-ink-muted">{ptBR.ds.templates}</span>
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates.map((template) => {
            const body = (
              <>
                <span className="text-body font-medium text-ink">{template.label}</span>
                {template.description ? (
                  <span className="text-caption text-ink-muted">{template.description}</span>
                ) : null}
              </>
            );
            return (
              <li key={template.label}>
                {template.href ? (
                  <Link href={template.href} className="ds-template m3-state">
                    {body}
                  </Link>
                ) : (
                  <button type="button" onClick={template.onSelect} className="ds-template m3-state">
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  if (layout === "page") {
    return (
      <div className={cn("ds-empty-page", className)}>
        <span className="ds-empty-glyph" aria-hidden="true">
          {icon ?? <IconInfo className="h-6 w-6" />}
        </span>
        <div className="flex max-w-prose flex-col items-center gap-1 text-center">
          <h2 className="text-heading text-ink">{title}</h2>
          {description ? <p className="text-body text-ink-muted">{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
        {starts ? <div className="w-full max-w-2xl">{starts}</div> : null}
      </div>
    );
  }

  return (
    <div className={cn("msds-state", className)}>
      {/* Not `.msds-state-icon`: that class hardcodes `color: rgb(var(--danger))`
          for the error variant, which would tint a neutral empty-state icon red. */}
      <span className="shrink-0 text-ink-subtle" aria-hidden="true">
        {icon ?? <IconInfo className="h-6 w-6" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <div className="msds-state-title">{title}</div>
          {description ? <div className="msds-state-desc">{description}</div> : null}
          {action ? <div style={{ marginTop: "10px" }}>{action}</div> : null}
        </div>
        {starts}
      </div>
    </div>
  );
}
