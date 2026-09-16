"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import {
  IconBook,
  IconFilter,
  IconGauge,
  IconHome,
  IconScatter,
} from "@/components/ui/icons";

const t = ptBR.nav;

/**
 * The five destinations that fit in one hand.
 *
 * Not the rail with a different coat of paint: it's an editorial choice about
 * what someone does on a phone. /comparar and /importar are left out — compare
 * wants table width, import wants a file that's rarely on the device — and so
 * are the two admin routes: keeping the catalog's vocabulary straight is desk
 * work. All of them stay reachable through the header drawer.
 *
 * Five is the ceiling: at 375 px, a sixth item leaves each target 62 px wide,
 * and the label starts truncating before the finger lands.
 */
const ITEMS = [
  { href: "/app", label: t.home, icon: IconHome },
  { href: "/app/selecao", label: t.selection, icon: IconFilter },
  { href: "/app/mapas", label: t.maps, icon: IconScatter },
  { href: "/app/catalogo", label: t.catalog, icon: IconBook },
  { href: "/app/painel", label: t.dashboard, icon: IconGauge },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The primary navigation on narrow screens.
 *
 * Replaces the two taps the modal drawer charged for every screen switch —
 * open, pick — with one. The drawer stays in the header, for the destinations
 * that aren't here.
 *
 * `min-h-12` (48 px) is a floor, not a suggestion: it's the minimum touch
 * target, and the height needs to survive a label that wraps to two lines.
 * `pb-[env(safe-area-inset-bottom)]` keeps the row above iOS's gesture bar;
 * without it, the fifth item sits under it and stops being tappable.
 *
 * The active indicator is a 3 px bar at the top of the item, not the bottom:
 * at the bottom it would fall inside the safe area, where half the devices
 * hide it.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ptBR.ui.mainNav}
      className="sticky bottom-0 z-30 grid grid-cols-5 gap-0.5 bg-rail px-1.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-control px-1 transition",
              "active:scale-[0.96]",
              active ? "bg-rail-accent/20 text-rail-accent" : "text-rail-ink-subtle",
            )}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute top-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-rail-accent"
              />
            ) : null}
            <Icon className="h-[19px] w-[19px] shrink-0" />
            <span className={cn("text-[0.5625rem] leading-tight", active && "font-semibold")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
