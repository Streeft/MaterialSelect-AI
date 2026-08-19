import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconDanger, IconInfo, IconCheck, IconWarning } from "./icons";

export type AlertTone = "info" | "warning" | "danger" | "success";

const TONES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: "border-info/30 bg-info-soft text-info-fg", icon: <IconInfo /> },
  warning: { box: "border-warning/40 bg-warning-soft text-warning-fg", icon: <IconWarning /> },
  danger: { box: "border-danger/40 bg-danger-soft text-danger-fg", icon: <IconDanger /> },
  success: { box: "border-success/30 bg-success-soft text-success-fg", icon: <IconCheck /> },
};

/**
 * A standing notice.
 *
 * Deliberately not dismissible. Two of the notices this application must show —
 * the demonstration-data warning and the scope-of-use limitation (§3.6 da
 * proposta) — are commitments, and a commitment the reader can click away stops
 * being one the moment they do.
 */
export function Alert({
  tone = "info",
  title,
  icon,
  role,
  className,
  children,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  /** Overrides the tone's default glyph. */
  icon?: ReactNode;
  /** "alert" for something that just went wrong; omit for a standing notice. */
  role?: "alert" | "status";
  className?: string;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div
      role={role}
      className={cn("flex gap-2.5 rounded-card border p-3 text-sm", t.box, className)}
    >
      <span className="mt-0.5 shrink-0">{icon ?? t.icon}</span>
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="max-w-prose text-ink-muted">{children}</div> : null}
      </div>
    </div>
  );
}
