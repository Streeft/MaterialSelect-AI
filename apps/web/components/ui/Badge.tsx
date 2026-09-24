import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

/**
 * A short status label. Always carries words — a bare coloured dot would put
 * the whole meaning in the one channel a colour-blind or printing reader loses.
 *
 * D-78: renders MSDS's `.msds-badge msds-badge-{tone}` classes (the six tones
 * exist on both sides — `lib/msds/msds.css`) on the app's own markup, rather
 * than delegating to MSDS's `Badge` component function, which only takes
 * `tone`/`children`. Real call sites need `className`
 * (`components/layout/AppSidebar.tsx`, `components/dashboard/
 * CoverageSummary.tsx`) and `title` (`components/DemoDataBadge.tsx`); `icon`
 * has no real call site today but stays in the signature for API stability.
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
    <span title={title} className={cn("msds-badge", `msds-badge-${tone}`, className)}>
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
    <span className={cn("msds-badge msds-badge-neutral", className)}>
      {/* `ink/20`, not a fixed black: the hairline exists so a pale seat (the
          Okabe–Ito yellow) still reads as a disc against the badge, and on the
          dark theme's graphite a black hairline is the one colour that cannot do
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
