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
import {
  SHOWN_RECENTS,
  isPinned,
  toggleGroupCollapsed,
  togglePinned,
  useCollapsedGroups,
  usePinned,
  useRecents,
  type NavEntry,
} from "@/lib/navMemory";
import { useTitleOverride } from "@/lib/pageTitle";
import { IconButton, ThemeToggle } from "@/components/ui";
import { useFocusTrap } from "@/components/ui/focusTrap";
import {
  IconBattery,
  IconBlend,
  IconBook,
  IconChevronDown,
  IconClock,
  IconClose,
  IconCoins,
  IconCompare,
  IconFilter,
  IconGauge,
  IconGear,
  IconHome,
  IconInfo,
  IconLayers,
  IconLeaf,
  IconLogout,
  IconPalette,
  IconMenu,
  IconNotebook,
  IconPanelLeft,
  IconPin,
  IconRuler,
  IconScatter,
  IconStar,
  IconTable,
  IconUpload,
} from "@/components/ui/icons";
import { useCanEditCatalog } from "@/lib/billing";

const t = ptBR.nav;

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const HOME: NavItem = { href: "/app", label: t.home, icon: IconHome };

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
export const GROUPS: NavGroup[] = [
  {
    id: "study",
    label: t.groupStudy,
    items: [
      { href: "/app/selecao", label: t.selection, icon: IconFilter },
      { href: "/app/mapas", label: t.maps, icon: IconScatter },
      { href: "/app/comparar", label: t.compare, icon: IconCompare },
      // D-92: os cadernos ficam em "Estudar" — são onde se estuda com as
      // próprias fontes, não onde os registros do catálogo moram.
      { href: "/app/cadernos", label: t.notebooks, icon: IconNotebook },
      // P2: o Engineering Solver e o Index Finder moram na mesma tela, porque
      // são a mesma derivação lida de dois jeitos.
      { href: "/app/dimensionar", label: t.solver, icon: IconRuler },
      { href: "/app/custo", label: t.cost, icon: IconCoins },
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
      { href: "/app/processos", label: t.processes, icon: IconGear },
      // D-130: o glossário mora em "Dados", ao lado do catálogo cujas grandezas explica.
      { href: "/app/glossario", label: t.glossary, icon: IconInfo },
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
      { href: "/app/admin/propriedades", label: t.properties, icon: IconTable },
    ],
  },
];

/**
 * The destinations this reader can use (D-86). A student admitted by open
 * access mode (D-83) cannot write the shared catalogue, so "Importar" and the
 * administration group would open only to say "somente leitura" — noise in the
 * one place they look for where to go. A curator sees everything, as before.
 * Hiding by role is not hiding a feature: the student has no use of it.
 */
export function visibleGroups(groups: NavGroup[], canEditCatalog: boolean): NavGroup[] {
  if (canEditCatalog) return groups;
  return groups
    .filter((group) => group.id !== "admin")
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.href !== "/app/importar"),
    }));
}

/** Screens outside the menu that still have a fixed name (D-207). */
const EXTRA_TITLES: Record<string, string> = {
  "/app/aparencia": ptBR.appearance.title,
  "/app/materiais/novo": ptBR.actions.new,
};

/**
 * D-207: the name of a screen with a fixed name, from the same list the menu
 * draws — so the tab title, the menu and the palette never disagree. Exact
 * paths only: a detail page (`/app/materiais/7`) names itself with
 * `usePageTitle` once its record loads.
 */
export function routeTitle(pathname: string): string | null {
  if (pathname === HOME.href) return HOME.label;
  for (const group of GROUPS) {
    for (const item of group.items) {
      if (item.href === pathname) return item.label;
    }
  }
  return EXTRA_TITLES[pathname] ?? null;
}

/** `/app` (the home item's own route) only matches itself; every other route also controls what's below it. */
export function isActive(pathname: string, href: string): boolean {
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

/**
 * The title of a group: a toggle that folds it (D-207), remembered per device.
 * On the collapsed rail there is no room for words, so the title stays only
 * for screen readers and the group never folds — its icons are the menu.
 */
function GroupTitle({
  id,
  label,
  listId,
  foldKey,
  open,
  railCollapsed,
}: {
  id: string;
  label: string;
  listId: string;
  /** What the fold is remembered under: the same for the rail and the drawer. */
  foldKey: string;
  open: boolean;
  railCollapsed: boolean;
}) {
  if (railCollapsed) {
    return (
      <span id={id} className="sr-only">
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      id={id}
      aria-expanded={open}
      aria-controls={listId}
      onClick={() => toggleGroupCollapsed(foldKey)}
      className="msds-rail-eyebrow flex min-h-8 w-full items-center justify-between gap-2 rounded-control text-left"
    >
      <span>{label}</span>
      <IconChevronDown
        className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
      />
    </button>
  );
}

/**
 * A titled group of destinations. Folding a group never hides where the reader
 * is: the current page stays listed under a folded title (D-207), and the list
 * still scrolls inside the rail (D-202) — nothing here can push an item out of
 * reach.
 */
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
  const listId = `${idPrefix}-list-${group.id}`;
  const folded = useCollapsedGroups().includes(group.id) && !collapsed;
  const items = folded
    ? group.items.filter((item) => isActive(pathname, item.href))
    : group.items;
  return (
    <div className="flex flex-col gap-0.5">
      <GroupTitle
        id={labelId}
        label={group.label}
        listId={listId}
        foldKey={group.id}
        open={!folded}
        railCollapsed={collapsed}
      />
      <ul id={listId} aria-labelledby={labelId} className="flex flex-col gap-0.5">
        {items.map((item) => (
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
 * One remembered page: the link, and beside it (never inside it) the pin
 * toggle. A sibling button, not a nested one, so each has its own name.
 */
function MemoryItem({
  entry,
  icon: Icon,
  pinned,
  current,
}: {
  entry: NavEntry;
  icon: IconComponent;
  pinned: boolean;
  current: boolean;
}) {
  const label = pinned ? t.unpin(entry.label) : t.pin(entry.label);
  return (
    <li className="flex items-center gap-1">
      <Link
        href={entry.href}
        aria-current={current ? "page" : undefined}
        className="msds-rail-item min-w-0 flex-1 text-sm"
      >
        <Icon className={cn("msds-rail-icon", current && "text-rail-accent")} />
        <span className="msds-rail-label truncate">{entry.label}</span>
      </Link>
      <IconButton
        size="sm"
        label={label}
        toggle
        selected={pinned}
        icon={<IconPin filled={pinned} />}
        onClick={() => togglePinned(entry)}
        className="shrink-0 text-rail-ink-muted"
      />
    </li>
  );
}

/**
 * "Fixados" and "Recentes" (D-207): what this reader keeps and what they just
 * opened, on this device. Both fold like the groups below them. Not drawn on
 * the collapsed rail: a pinned record has no glyph of its own, and a column
 * of identical pins says nothing.
 */
function MemorySections({ pathname, idPrefix }: { pathname: string; idPrefix: string }) {
  const pinned = usePinned();
  const recents = useRecents();
  const collapsedGroups = useCollapsedGroups();
  const currentTitle = useTitleOverride(pathname) ?? routeTitle(pathname);
  const currentPinned = isPinned(pinned, pathname);
  const shownRecents = recents.slice(0, SHOWN_RECENTS);

  const pinnedListId = `${idPrefix}-list-pinned`;
  const recentsListId = `${idPrefix}-list-recents`;
  const pinnedOpen = !collapsedGroups.includes("pinned");
  const recentsOpen = !collapsedGroups.includes("recents");
  const pinLabel = currentPinned ? t.unpinCurrent : t.pinCurrent;

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <GroupTitle
              id={`${idPrefix}-pinned`}
              label={t.groupPinned}
              listId={pinnedListId}
              foldKey="pinned"
              open={pinnedOpen}
              railCollapsed={false}
            />
          </div>
          {currentTitle && pathname !== HOME.href ? (
            <IconButton
              size="sm"
              label={pinLabel}
              toggle
              selected={currentPinned}
              icon={<IconPin filled={currentPinned} />}
              onClick={() => togglePinned({ href: pathname, label: currentTitle })}
              className="shrink-0 text-rail-ink-muted"
            />
          ) : null}
        </div>
        {pinnedOpen ? (
          pinned.length > 0 ? (
            <ul
              id={pinnedListId}
              aria-labelledby={`${idPrefix}-pinned`}
              className="flex flex-col gap-0.5"
            >
              {pinned.map((entry) => (
                <MemoryItem
                  key={entry.href}
                  entry={entry}
                  icon={IconPin}
                  pinned
                  current={entry.href === pathname}
                />
              ))}
            </ul>
          ) : (
            <p id={pinnedListId} className="px-2.5 text-xs text-rail-ink-muted">
              {t.pinnedEmpty}
            </p>
          )
        ) : null}
      </div>
      {shownRecents.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <GroupTitle
            id={`${idPrefix}-recents`}
            label={t.groupRecents}
            listId={recentsListId}
            foldKey="recents"
            open={recentsOpen}
            railCollapsed={false}
          />
          {recentsOpen ? (
            <ul
              id={recentsListId}
              aria-labelledby={`${idPrefix}-recents`}
              className="flex flex-col gap-0.5"
            >
              {shownRecents.map((entry) => (
                <MemoryItem
                  key={entry.href}
                  entry={entry}
                  icon={IconClock}
                  pinned={isPinned(pinned, entry.href)}
                  current={entry.href === pathname}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
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
      <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
        {/* D-196: Aparência, a link with the icon button's look. */}
        <Link
          href="/app/aparencia"
          aria-label={ptBR.appearance.open}
          title={ptBR.appearance.open}
          className="msds-icon-btn msds-icon-btn-standard msds-icon-btn-sm msds-ripple-host"
        >
          <IconPalette />
        </Link>
        <IconButton
          size="sm"
          label={ptBR.auth.logout}
          icon={<IconLogout />}
          onClick={handleLogout}
          disabled={loggingOut}
        />
      </div>
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
  const groups = visibleGroups(GROUPS, useCanEditCatalog());
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
      </header>

      {/* Wide screens: the rail. `sticky` with `h-screen` keeps it in place
          while the content column scrolls beneath. */}
      <aside
        id="navegacao-lateral"
        data-surface="rail"
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col gap-2 bg-rail px-3 py-3 transition-[width] ease-emphasized duration-slow lg:flex",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <div className={cn("flex flex-col gap-2", collapsed && "items-center")}>
          <BrandLink pathname={pathname} collapsed={collapsed} />
        </div>

        <nav
          aria-label={ptBR.ui.mainNav}
          style={railAccentStyle}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain"
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
          {!collapsed && <MemorySections pathname={pathname} idPrefix="nav-rail" />}
          {groups.map((group) => (
            <NavGroupList
              key={group.id}
              group={group}
              pathname={pathname}
              idPrefix="nav-rail"
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* D-202: `shrink-0` keeps the footer whole; it is the list above that
            gives way and scrolls, never the user's own controls. */}
        <div className="mt-auto flex shrink-0 flex-col gap-1.5 border-t border-rail-edge/10 pt-2">
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
            className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col gap-3 overflow-hidden bg-rail p-4 shadow-overlay"
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
            {/* D-202: the list scrolls inside the panel, not the panel itself, so the
                brand, the close button and the footer stay in place and the last
                group ("Administrar") is reachable on a short phone. */}
            <nav
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain"
              style={railAccentStyle}
            >
              <ul className="flex flex-col gap-0.5">
                <li>
                  <NavLink item={HOME} active={isActive(pathname, HOME.href)} />
                </li>
              </ul>
              <MemorySections pathname={pathname} idPrefix="nav-drawer" />
              {groups.map((group) => (
                <NavGroupList
                  key={group.id}
                  group={group}
                  pathname={pathname}
                  idPrefix="nav-drawer"
                />
              ))}
            </nav>
            <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-rail-edge/10 pt-3">
              <UserFooter />
              <ThemeToggle compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
