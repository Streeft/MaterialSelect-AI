"use client";

import {
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type SVGProps,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { Badge, IconButton, ThemeToggle } from "@/components/ui";
import { useFocusTrap } from "@/components/ui/focusTrap";
import {
  IconBattery,
  IconBlend,
  IconBook,
  IconClose,
  IconCompare,
  IconFilter,
  IconGauge,
  IconHome,
  IconLayers,
  IconLeaf,
  IconLogout,
  IconMenu,
  IconPanelLeft,
  IconRuler,
  IconScatter,
  IconStar,
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

const HOME: NavItem = { href: "/app", label: t.home, icon: IconHome };

/**
 * Three groups, in the order work happens: you study something, the study
 * needs data, and someone maintains the vocabulary those data are
 * written in.
 *
 * Every destination carries a glyph, which the previous header didn't need and
 * this one does: a rail that collapses to 68px has no room for words, and
 * the icon becomes the label. Each one draws what the screen *does* — a funnel
 * for the selection funnel, plotted points for the property map — rather than
 * a generic document that would make all eight look the same at 18px.
 */
const GROUPS: NavGroup[] = [
  {
    id: "study",
    label: t.groupStudy,
    items: [
      { href: "/app/selecao", label: t.selection, icon: IconFilter },
      { href: "/app/mapas", label: t.maps, icon: IconScatter },
      { href: "/app/comparar", label: t.compare, icon: IconCompare },
      // P2: o Engineering Solver e o Index Finder moram na mesma tela, porque
      // são a mesma derivação lida de dois jeitos.
      { href: "/app/dimensionar", label: t.solver, icon: IconRuler },
      { href: "/app/custo", label: t.cost, icon: IconGauge },
      // P3: a auditoria ambiental fica ao lado do custo porque as duas
      // respondem à mesma pergunta em moedas diferentes — o que esta peça
      // custa, em dinheiro e em energia.
      { href: "/app/eco", label: t.eco, icon: IconLeaf },
      // P4: o Battery Designer (Módulo S) permite dimensionar packs de bateria
      // e selecionar químicas eletroquímicas para requisitos de aplicação.
      { href: "/app/baterias", label: t.battery, icon: IconBattery },
    ],
  },
  {
    id: "data",
    label: t.groupData,
    items: [
      { href: "/app/catalogo", label: t.catalog, icon: IconBook },
      // P1-4: o segundo universo passa a ter porta de entrada. Sem isto ele só
      // era alcançável de dentro de um estágio ou da ficha de um material.
      { href: "/app/processos", label: t.processes, icon: IconLayers },
      // P3: sintetizar cria um registro, e um registro próprio — por isso
      // fica em "Dados", ao lado de onde ele vai aparecer, e não em
      // "Estudar", que é onde se decide com registros que já existem.
      { href: "/app/sintetizar", label: t.synthesis, icon: IconBlend },
      { href: "/app/meus-registros", label: t.myRecords, icon: IconStar },
      { href: "/app/painel", label: t.dashboard, icon: IconGauge },
      { href: "/app/importar", label: t.imports, icon: IconUpload },
    ],
  },
  {
    id: "admin",
    label: t.groupAdmin,
    items: [
      { href: "/app/admin/classes", label: t.classes, icon: IconLayers },
      { href: "/app/admin/propriedades", label: t.properties, icon: IconRuler },
    ],
  },
];

/** `/app` (the home item's own route) only matches itself; every other route also controls what's below it. */
function isActive(pathname: string, href: string): boolean {
  if (href === HOME.href) return pathname === HOME.href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A destination, drawn with the MSDS rail vocabulary (`.msds-rail-item`,
 * `.msds-rail-icon`, `.msds-rail-label` — `lib/msds/msds.css`) instead of
 * this app's own hand-rolled classes, but never through `lib/msds`'s own
 * `NavRail` function: that function renders a `<button onClick>`, never an
 * `<a href>` — no real navigation semantics (no prefetch, no middle-click
 * or Ctrl-click "open in a new tab"), the same class of gap D-77 found in
 * the vendored `Breadcrumb`. This stays a real `<Link>`.
 *
 * The active item says "you are here" three ways, and each one covers a
 * failure mode of the others: `.msds-rail-item[aria-current="page"]::before`
 * (the left-edge bar, drawn by `lib/msds/msds.css`) survives the collapsed
 * rail, the background tint survives a glance, and `aria-current` survives
 * having no color at all. Both read `--row-accent`, which the rail/drawer
 * container below sets to `rgb(var(--rail-accent))` — the same per-route
 * token D-73 already validated by contrast, just fed into MSDS's own
 * active-item rule instead of this file's. No new color is introduced.
 *
 * The label is never removed when the rail collapses, only becomes `sr-only`
 * (D-37). MSDS's own `.msds-rail[data-collapsed="true"] .msds-rail-label`
 * clip rule would do the same thing, but only under a `.msds-rail` ancestor
 * this file doesn't apply to its `<aside>` (that class also imposes a fixed
 * dark background, a rounded panel radius and a fixed width — right for a
 * floating panel, wrong for an edge-to-edge rail with a theme-driven width
 * transition this app already has). Tailwind's `sr-only` does the identical
 * job without that ancestor, and is what's actually applied here.
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
      // The current page is announced, not just painted: color alone leaves
      // screen reader users with no idea where they are.
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn("msds-rail-item text-sm", collapsed && "justify-center")}
    >
      <Icon
        className={cn("msds-rail-icon", active && "text-rail-accent")}
      />
      <span className={cn("msds-rail-label", collapsed && "sr-only")}>
        {item.label}
      </span>
    </Link>
  );
}

/** A titled group of destinations. */
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
        className={cn("msds-rail-eyebrow", collapsed && "sr-only")}
      >
        {group.label}
      </span>
      <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <li key={item.href}>
            <NavLink
              item={item}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * `--row-accent`, in the shape `lib/msds/msds.css`'s
 * `.msds-rail-item[aria-current="page"]` expects: a plain CSS color, fed
 * from this app's own per-route token (D-73) rather than MSDS's own
 * (unvalidated, brand-only) default. Set once on the nav container — custom
 * properties inherit, so every `NavLink` below picks it up without carrying
 * the style itself.
 */
const railAccentStyle = { "--row-accent": "rgb(var(--rail-accent))" } as CSSProperties;

/** The brand, which is also the link to home. */
function BrandLink({
  pathname,
  collapsed = false,
}: {
  pathname: string;
  collapsed?: boolean;
}) {
  return (
    <Link
      href="/app"
      aria-current={pathname === "/app" ? "page" : undefined}
      title={collapsed ? ptBR.appName : undefined}
      className="group flex items-center gap-2 rounded-control px-1 py-1"
    >
      {/* A squircle that rounds more under the pointer. Decorative — the name to the
          side is the accessible one, and stays in the tree even when the rail is
          too narrow to paint it. */}
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[0.7rem] bg-brand text-sm font-bold text-brand-fg transition-all group-hover:scale-105 group-hover:rounded-[1.1rem]"
      >
        M
      </span>
      <span
        className={cn("font-semibold text-rail-ink", collapsed && "sr-only")}
      >
        {ptBR.appName}
      </span>
    </Link>
  );
}

/**
 * Who is authenticated, and the only way out.
 *
 * Renders nothing while `/auth/me` resolves or when there's no user — the
 * layout's `AuthGate` already covers that wait, so this footer only needs to cover
 * the case when a user is loaded.
 */
function UserFooter({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      queryClient.setQueryData(["me"], undefined);
      router.replace("/entrar");
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        collapsed ? "flex-col" : "justify-between",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-2",
          collapsed && "flex-col",
        )}
        title={collapsed ? user.name : undefined}
      >
        {user.avatar_url ? (
          // Third-party avatar URL, not a local asset that next/image can
          // optimize.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rail-accent/25 text-xs font-semibold text-rail-accent"
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}
        {!collapsed && (
          <span className="truncate text-xs font-medium text-rail-ink-muted">
            {user.name}
          </span>
        )}
      </div>
      <IconButton
        size="sm"
        label={ptBR.auth.logout}
        icon={<IconLogout />}
        onClick={handleLogout}
        disabled={loggingOut}
      />
    </div>
  );
}

/**
 * The app navigation: a permanent rail at `lg` and up, a modal drawer below that.
 *
 * Replaces a top header whose eight links only dropped at 1280px
 * and were a horizontal row that told nothing about which screens belong
 * together. The rail gets the two things that row couldn't have:
 * grouping stays visible while working, and width is yours — collapse
 * to glyphs when the map on screen matters more than the menu.
 *
 * Collapsed state is React state and deliberately **not** persisted.
 * Survives all client navigation because this component lives in the root layout
 * and never unmounts; returns to normal on reload. Persisting would mean reading
 * `localStorage` during render — which disagrees with server markup and makes React
 * complain — or animating the rail closed after first paint, which is worse than
 * starting open.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, () => setOpen(false));

  // A drawer that survived navigation it caused would cover the page
  // the reader asked for. Adjusting state during render avoids cascading
  // effects and satisfies react-hooks/set-state-in-effect.
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  const collapseLabel = collapsed
    ? ptBR.ui.expandSidebar
    : ptBR.ui.collapseSidebar;

  return (
    <>
      {/* Narrow screens: a thin bar that carries only the path to the drawer.
          Theme control is not duplicated here — it lives inside the drawer, beside
          everything else that's navigation chrome. */}
      <header
        data-surface="rail"
        className="sticky top-0 z-30 flex items-center gap-2 bg-rail px-3 py-2 lg:hidden"
      >
        {/* The label doesn't change to "close": while the drawer is open this
            button sits behind the overlay, and the drawer carries its own
            close control. Two buttons with the same name and function are a maze
            for those reading by name. State is in `aria-expanded`. */}
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
          while the content column scrolls beneath. */}
      <aside
        id="navegacao-lateral"
        data-surface="rail"
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col gap-4 bg-rail px-3 py-4 transition-[width] ease-emphasized duration-slow lg:flex",
          collapsed ? "w-[68px]" : "w-64",
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
          style={railAccentStyle}
          className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain"
        >
          <ul className="flex flex-col gap-0.5">
            <li>
              <NavLink
                item={HOME}
                active={isActive(pathname, HOME.href)}
                collapsed={collapsed}
              />
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

        <div className="mt-auto flex flex-col gap-2 border-t border-rail-edge/10 pt-3">
          <UserFooter collapsed={collapsed} />
          <div
            className={cn(
              "flex items-center gap-2",
              collapsed ? "flex-col" : "justify-between",
            )}
          >
            {!collapsed && <ThemeToggle compact />}
            <IconButton
              size="sm"
              label={collapseLabel}
              title={collapseLabel}
              icon={
                <IconPanelLeft
                  className={cn(
                    "transition-transform",
                    collapsed && "rotate-180",
                  )}
                />
              }
              aria-expanded={!collapsed}
              aria-controls="navegacao-lateral"
              onClick={() => setCollapsed((value) => !value)}
            />
          </div>
        </div>
      </aside>

      {/* The drawer is rendered only while open — a hidden copy of each
          link would double tab stops across the whole page. */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-rail/70"
          />
          <div
            id="menu-principal"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ptBR.ui.mainNav}
            tabIndex={-1}
            data-surface="rail"
            className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto bg-rail p-4 shadow-overlay"
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
            <nav className="flex flex-1 flex-col gap-5" style={railAccentStyle}>
              <ul className="flex flex-col gap-0.5">
                <li>
                  <NavLink item={HOME} active={isActive(pathname, HOME.href)} />
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
            <div className="mt-auto flex flex-col gap-2 border-t border-rail-edge/10 pt-3">
              <UserFooter />
              <ThemeToggle compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
