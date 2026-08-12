"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { Badge, IconButton, ThemeToggle } from "@/components/ui";
import { useFocusTrap } from "@/components/ui/focusTrap";
import {
  IconBook,
  IconClose,
  IconCompare,
  IconFilter,
  IconGauge,
  IconHome,
  IconLayers,
  IconMenu,
  IconPanelLeft,
  IconRuler,
  IconScatter,
  IconUpload,
} from "@/components/ui/icons";

const t = ptBR.nav;

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const HOME: NavItem = { href: "/", label: t.home, icon: IconHome };

/**
 * Three groups, in the order the work happens: you study something, the study
 * needs data, and somebody maintains the vocabulary that data is written in.
 *
 * Every destination carries a glyph, which the previous header did not need and
 * this one does: a rail that collapses to 76 px has no room for words, so the
 * icon becomes the label. Each draws what the screen *does* — a funnel for the
 * selection funnel, plotted points for the property map — rather than a generic
 * document that would make all eight look alike at 18 px.
 */
const GROUPS: NavGroup[] = [
  {
    id: "study",
    label: t.groupStudy,
    items: [
      { href: "/selecao", label: t.selection, icon: IconFilter },
      { href: "/mapas", label: t.maps, icon: IconScatter },
      { href: "/comparar", label: t.compare, icon: IconCompare },
    ],
  },
  {
    id: "data",
    label: t.groupData,
    items: [
      { href: "/catalogo", label: t.catalog, icon: IconBook },
      { href: "/painel", label: t.dashboard, icon: IconGauge },
      { href: "/importar", label: t.imports, icon: IconUpload },
    ],
  },
  {
    id: "admin",
    label: t.groupAdmin,
    items: [
      { href: "/admin/classes", label: t.classes, icon: IconLayers },
      { href: "/admin/propriedades", label: t.properties, icon: IconRuler },
    ],
  },
];

/** `/` only matches itself; every other route also owns what hangs below it. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One destination.
 *
 * The shape is a full pill, and the movement is the point of the whole
 * redesign: the item grows from its left edge under the pointer and gives way
 * under the press, so the control behaves like something soft instead of a
 * painted rectangle. It is three CSS properties — no animation library, which
 * §13 de REDESIGN.md rules out and which nothing here would need anyway.
 *
 * The label is never removed when the rail collapses, only made `sr-only`. A
 * link whose text disappears is a link with no accessible name; a link whose
 * text is only unpainted still announces itself, and gains a native tooltip for
 * the reader who can see but cannot guess the glyph.
 */
function NavLink({
  item,
  active,
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      // The current page is announced, not only painted: colour alone leaves a
      // screen-reader user with no idea where they are.
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-full py-2 text-sm transition",
        "origin-left hover:scale-[1.02] active:scale-[0.98]",
        collapsed ? "justify-center px-2" : "px-3",
        active
          ? "bg-brand-50 font-medium text-brand-700 shadow-glow"
          : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] transition-transform group-hover:scale-110",
          active && "scale-105",
        )}
      />
      <span className={cn(collapsed && "sr-only")}>{item.label}</span>
    </Link>
  );
}

/** One titled group of destinations. */
function NavGroupList({
  group,
  pathname,
  idPrefix,
  collapsed = false,
}: {
  group: NavGroup;
  pathname: string;
  idPrefix: string;
  collapsed?: boolean;
}) {
  const labelId = `${idPrefix}-${group.id}`;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        id={labelId}
        className={cn(
          "px-3 pb-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted",
          collapsed && "sr-only",
        )}
      >
        {group.label}
      </span>
      <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <li key={item.href}>
            <NavLink item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The wordmark, which is also the link home. */
function BrandLink({ pathname, collapsed = false }: { pathname: string; collapsed?: boolean }) {
  return (
    <Link
      href="/"
      aria-current={pathname === "/" ? "page" : undefined}
      title={collapsed ? ptBR.appName : undefined}
      className="group flex items-center gap-2 rounded-control px-1 py-1"
    >
      {/* A squircle that rounds further under the pointer. Decorative — the
          name next to it is the accessible one, and stays in the tree even
          when the rail is too narrow to paint it. */}
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[0.7rem] bg-brand text-sm font-bold text-brand-fg transition-all group-hover:scale-105 group-hover:rounded-[1.1rem]"
      >
        M
      </span>
      <span className={cn("font-semibold text-ink", collapsed && "sr-only")}>{ptBR.appName}</span>
    </Link>
  );
}

/**
 * The application's navigation: a persistent rail from `lg` up, a modal drawer
 * below it.
 *
 * It replaces a top header whose eight links only fitted from 1280 px and were
 * a horizontal row that said nothing about which screens belong together. A
 * rail buys the two things that row could not have: the grouping stays visible
 * while you work, and the width is yours — collapse it to glyphs when the map
 * on screen matters more than the menu.
 *
 * The collapsed state is React state and is deliberately **not** persisted. It
 * survives every client-side navigation, because this component lives in the
 * root layout and never unmounts; it resets on a hard reload. Storing it would
 * mean either reading `localStorage` during render — which disagrees with the
 * server markup and makes React complain — or animating the rail shut after
 * first paint, which is worse than starting open.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, () => setOpen(false));

  // A drawer that survives the navigation it just caused would cover the page
  // the reader asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const collapseLabel = collapsed ? ptBR.ui.expandSidebar : ptBR.ui.collapseSidebar;

  return (
    <>
      {/* Narrow screens: a slim bar that carries only the way into the drawer.
          The theme control is not duplicated here — it lives inside the drawer,
          next to everything else that is navigation chrome. */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-edge bg-surface-raised px-3 py-2 lg:hidden">
        {/* The label does not flip to "close": while the drawer is open this
            button sits behind the overlay, and the drawer carries its own close
            control. Two buttons with the same name and the same job is a maze
            for anyone reading by name. State is on `aria-expanded`. */}
        <IconButton
          size="sm"
          label={ptBR.ui.openMenu}
          icon={<IconMenu />}
          aria-expanded={open}
          aria-controls="menu-principal"
          onClick={() => setOpen(true)}
        />
        <BrandLink pathname={pathname} />
        <Badge tone="warning" className="ml-auto hidden sm:inline-flex">
          {ptBR.demoBadge}
        </Badge>
      </header>

      {/* Wide screens: the rail. `sticky` with `h-screen` keeps it in place
          while the content column scrolls under it. */}
      <aside
        id="navegacao-lateral"
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col gap-4 border-r border-edge bg-surface-raised px-3 py-4 transition-[width] lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className={cn("flex flex-col gap-2", collapsed && "items-center")}>
          <BrandLink pathname={pathname} collapsed={collapsed} />
          {!collapsed && (
            <Badge tone="warning" className="self-start">
              {ptBR.demoBadge}
            </Badge>
          )}
        </div>

        <nav
          aria-label={ptBR.ui.mainNav}
          className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain"
        >
          <ul className="flex flex-col gap-0.5">
            <li>
              <NavLink item={HOME} active={isActive(pathname, "/")} collapsed={collapsed} />
            </li>
          </ul>
          {GROUPS.map((group) => (
            <NavGroupList
              key={group.id}
              group={group}
              pathname={pathname}
              idPrefix="nav-rail"
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div
          className={cn(
            "mt-auto flex items-center gap-2 border-t border-edge pt-3",
            collapsed ? "flex-col" : "justify-between",
          )}
        >
          {!collapsed && <ThemeToggle compact />}
          <IconButton
            size="sm"
            label={collapseLabel}
            title={collapseLabel}
            icon={<IconPanelLeft className={cn("transition-transform", collapsed && "rotate-180")} />}
            aria-expanded={!collapsed}
            aria-controls="navegacao-lateral"
            onClick={() => setCollapsed((value) => !value)}
          />
        </div>
      </aside>

      {/* The drawer is rendered only while open — a hidden copy of every link
          would double the tab stops on every page. */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-surface-inverted/50"
          />
          <div
            id="menu-principal"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ptBR.ui.mainNav}
            tabIndex={-1}
            className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r border-edge bg-surface-raised p-4 shadow-overlay"
          >
            <div className="flex items-center justify-between gap-2">
              <BrandLink pathname={pathname} />
              <IconButton
                size="sm"
                label={ptBR.ui.closeMenu}
                icon={<IconClose />}
                onClick={() => setOpen(false)}
              />
            </div>
            <nav className="flex flex-1 flex-col gap-4">
              <ul className="flex flex-col gap-0.5">
                <li>
                  <NavLink item={HOME} active={isActive(pathname, "/")} />
                </li>
              </ul>
              {GROUPS.map((group) => (
                <NavGroupList
                  key={group.id}
                  group={group}
                  pathname={pathname}
                  idPrefix="nav-drawer"
                />
              ))}
            </nav>
            <div className="mt-auto border-t border-edge pt-3">
              <ThemeToggle compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
