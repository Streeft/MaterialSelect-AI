import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { IconDanger, IconInfo } from "./icons";
import { Button } from "./Button";
import { MdCircularProgress } from "./material/elements";

/**
 * Loading, empty and error are states of the same screen, not afterthoughts.
 * They live together here so a route cannot ship one and forget the others —
 * the convention in docs/CLAUDE.md that these are always handled only holds if
 * handling them is cheaper than not.
 */

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <MdCircularProgress
      indeterminate
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("h-4 w-4 align-[-0.125em]", className)}
    />
  );
}

/** Placeholder box with the shape of the content that is coming. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block animate-pulse rounded bg-surface-sunken", className)}
    />
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
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-2 rounded-card border border-danger/40 bg-danger-soft p-4 text-sm text-danger-fg",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <IconDanger />
        {title}
      </p>
      {description ? <div className="text-ink-muted">{description}</div> : null}
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {ptBR.ui.retry}
        </Button>
      ) : null}
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
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-card border border-dashed border-edge-strong bg-surface-raised px-6 py-10 text-center",
        className,
      )}
    >
      <span className="text-ink-subtle">{icon ?? <IconInfo className="h-6 w-6" />}</span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <div className="max-w-prose text-sm text-ink-muted">{description}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
