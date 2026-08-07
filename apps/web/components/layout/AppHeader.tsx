"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { Badge, IconButton, ThemeToggle } from "@/components/ui";
import { useFocusTrap } from "@/components/ui/focusTrap";
import { IconClose, IconMenu } from "@/components/ui/icons";


const t = ptBR.nav;

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * Three groups, in the order the work happens: you study something, the study
 * needs data, and somebody maintains the vocabulary that data is written in.
 * The eight links were previously a flat row that said nothing about which
 * screens belong together — and, at 375 px, overflowed the page.
 */
const GROUPS: NavGroup[] = [
  {
    id: "study",
    label: t.groupStudy,
    items: [
      { href: "/selecao", label: t.selection },
      { href: "/mapas", label: t.maps },
      { href: "/comparar", label: t.compare },
    ],
  },
  {
    id: "data",
    label: t.groupData,
    items: [
      { href: "/catalogo", label: t.catalog },
      { href: "/importar", label: t.imports },
    ],
  },
  {
    id: "admin",
    label: t.groupAdmin,
    items: [
      { href: "/admin/classes", label: t.classes },
      { href: "/admin/propriedades", label: t.properties },
    ],
  },
];

/** `/` only matches itself; every other route also owns what hangs below it. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  active,
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      // The current page is announced, not only painted: colour alone leaves a
      // screen-reader user with no idea where they are.
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-control px-2 py-1 text-sm transition",
        active
          ? "bg-brand-50 font-medium text-brand-700"
          : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
        className,
      )}
    >
      {label}
    </Link>
  );
}

/** The same links, stacked, for the drawer. */
function NavGroupList({
  group,
  pathname,
  idPrefix,
  itemClassName,
}: {
  group: NavGroup;
  pathname: string;
  idPrefix: string;
  itemClassName?: string;
}) {
  const labelId = `${idPrefix}-${group.id}`;
  return (
    <>
      <span id={labelId} className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        {group.label}
      </span>
      <ul aria-labelledby={labelId} className={cn("flex", itemClassName)}>
        {group.items.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} label={item.label} active={isActive(pathname, item.href)} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, () => setOpen(false));

  // A drawer that survives the navigation it just caused would cover the page
  // the reader asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="border-b border-edge bg-surface-raised">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className="flex shrink-0 items-baseline gap-2 font-semibold text-brand-700"
        >
          {ptBR.appName}
          <Badge tone="warning" className="hidden sm:inline-flex">
            {ptBR.demoBadge}
          </Badge>
        </Link>

        {/* Wide screens: everything visible, grouped. */}
        <nav
          aria-label={ptBR.ui.mainNav}
          className="ml-auto hidden items-center gap-4 lg:flex"
        >
          {GROUPS.map((group) => (
            <div key={group.id} className="flex items-center gap-1.5">
              <NavGroupList
                group={group}
                pathname={pathname}
                idPrefix="nav-wide"
                itemClassName="items-center gap-0.5"
              />
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeToggle />
          {/* The label does not flip to "close": while the drawer is open this
              button sits behind the overlay, and the drawer carries its own
              close control. Two buttons with the same name and the same job is
              a maze for anyone reading by name. State is on `aria-expanded`. */}
          <IconButton
            size="sm"
            className="lg:hidden"
            label={ptBR.ui.openMenu}
            icon={<IconMenu />}
            aria-expanded={open}
            aria-controls="menu-principal"
            onClick={() => setOpen(true)}
          />
        </div>
      </div>

      {/* Narrow screens: a drawer with the same groups. Rendered only while
          open — a hidden copy of every link would double the tab stops. */}
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
            className="absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-l border-edge bg-surface-raised p-4 shadow-overlay"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{ptBR.ui.mainNav}</span>
              <IconButton
                size="sm"
                label={ptBR.ui.closeMenu}
                icon={<IconClose />}
                onClick={() => setOpen(false)}
              />
            </div>
            <nav className="flex flex-col gap-4">
              <ul className="flex flex-col">
                <li>
                  <NavLink href="/" label={t.home} active={pathname === "/"} />
                </li>
              </ul>
              {GROUPS.map((group) => (
                <div key={group.id} className="flex flex-col gap-1">
                  <NavGroupList
                    group={group}
                    pathname={pathname}
                    idPrefix="nav-drawer"
                    itemClassName="flex-col"
                  />
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
