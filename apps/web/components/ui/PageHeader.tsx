"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { groupForPath, labelForPath } from "@/lib/design/sections";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { MenuButton } from "./Menu";
import { IconMoreHorizontal } from "./icons";

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
 * The actions follow one order on every screen (D-212, after the Stripe and
 * Vercel dashboards): the quiet secondary verbs, then the "⋯" overflow menu
 * with what is rarely needed, then the one `primary` at the far end — where
 * the eye lands last and the thumb reaches first. `actions` is the older,
 * unordered slot and still renders, before all three, for headers that have
 * not been sorted into roles.
 *
 * Replaces the `<h1 className="text-xl font-semibold text-ink">` copied across
 * twelve routes. The level is always `h1`: it's the document title.
 */
export function PageHeader({
  title,
  description,
  actions,
  primaryAction,
  secondaryActions,
  overflow,
  overflowLabel = ptBR.ui.moreActions,
  breadcrumb,
  group,
  eyebrow: showEyebrow = true,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Controls of the whole page, not a card (unordered; prefer the three below). */
  actions?: ReactNode;
  /** The screen's one `primary` (D-91): a `Button`/`ButtonLink` with `variant="primary"`. */
  primaryAction?: ReactNode;
  /** Quiet verbs (`secondary`, `tonal`, `ghost`, an "Exportar ▾" `MenuButton`). */
  secondaryActions?: ReactNode;
  /** `MenuItem`s for the "⋯" menu: what a reader needs now and then. */
  overflow?: ReactNode;
  overflowLabel?: string;
  /**
   * The trail of a detail page (D-207). Drawn above the title; a page with a
   * trail usually passes `eyebrow={false}` too, or the place is said twice.
   */
  breadcrumb?: Crumb[];
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
  const hasActions = Boolean(actions || primaryAction || secondaryActions || overflow);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {breadcrumb && breadcrumb.length > 0 ? <Breadcrumb items={breadcrumb} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        {hasActions ? (
          <div
            role="group"
            aria-label={ptBR.ui.pageActions}
            data-page-actions
            className="flex max-w-full shrink-0 flex-wrap items-center gap-2"
          >
            {actions}
            {secondaryActions}
            {overflow ? (
              <MenuButton label={overflowLabel} icon={<IconMoreHorizontal />} iconOnly>
                {overflow}
              </MenuButton>
            ) : null}
            {primaryAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}
