"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { groupForPath, labelForPath } from "@/lib/design/sections";

/**
 * A route's header: where you are, what this screen is, and the controls
 * that belong to the whole page.
 *
 * The smallcap line above the title is the written half of the hue system.
 * Color alone locates those who know the app; "data · catalog"
 * locates those opening the screen for the first time, and it's the only one
 * a screen reader announces. `group` is optional because three routes —
 * /selecao, /mapas, /comparar — belong to the same rail grouping and it's
 * worth repeating; where there's no group, only the section name appears.
 *
 * The hue isn't passed as a prop: it comes from `sectionForPath`, the same
 * function that writes `data-section` on `<html>`. A screen can't disagree with
 * the rail about which section it's in.
 *
 * Replaces the `<h1 className="text-xl font-semibold text-ink">` copied across
 * twelve routes. The level is always `h1`: it's the document title.
 */
export function PageHeader({
  title,
  description,
  actions,
  group,
  eyebrow: showEyebrow = true,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Controls of the whole page, not a card. */
  actions?: ReactNode;
  /**
   * The rail grouping. Left out, it comes from the route (`groupForPath`,
   * D-205), so a page cannot forget it; pass it only to override.
   */
  group?: string;
  /**
   * `false` on a detail page whose breadcrumb already says where it is
   * (D-205): "dados · catálogo" over "Catálogo › Metais" said it twice.
   */
  eyebrow?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const label = labelForPath(pathname).toLowerCase();
  const groupLabel = (group ?? groupForPath(pathname))?.toLowerCase();
  const eyebrow = groupLabel ? `${groupLabel} · ${label}` : label;

  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {showEyebrow ? (
          <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description ? (
          <p className="max-w-prose text-body text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
