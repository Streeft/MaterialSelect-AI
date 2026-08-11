import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-edge bg-surface-sunken text-ink-muted",
  brand: "border-brand-200 bg-brand-50 text-brand-700",
  success: "border-success/30 bg-success-soft text-success-fg",
  warning: "border-warning/30 bg-warning-soft text-warning-fg",
  danger: "border-danger/30 bg-danger-soft text-danger-fg",
  info: "border-info/30 bg-info-soft text-info-fg",
};

/**
 * A short status label. Always carries words — a bare coloured dot would put
 * the whole meaning in the one channel a colour-blind or printing reader loses.
 */
export function Badge({
  tone = "neutral",
  icon,
  title,
  className,
  children,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  /**
   * Hover text. Only ever an elaboration of the label already written in the
   * badge — a `title` is invisible on touch and inconsistently announced, so it
   * must never be the only place a fact appears.
   */
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium leading-4",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * A material class, coloured from the shared categorical palette.
 *
 * The colour comes from lib/design/palette.ts so that the badge, the map marker
 * and the report legend cannot disagree about what "Cerâmicas" looks like.
 */
export function ClassBadge({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface-sunken px-2 py-0.5 text-2xs font-medium leading-4 text-ink-muted",
        className,
      )}
    >
      {/* `ink/20`, not a fixed black: the hairline exists so a pale seat (the
          Okabe–Ito yellow) still reads as a disc against the badge, and on the
          near-black surface a black hairline is the one colour that cannot do
          that. Following the ink token flips it with the theme. */}
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full border border-ink/20"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}
