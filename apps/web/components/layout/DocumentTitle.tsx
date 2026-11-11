"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordRecent } from "@/lib/navMemory";
import { formatDocumentTitle, useTitleOverride } from "@/lib/pageTitle";
import { HOME, routeTitle } from "./AppSidebar";

/**
 * D-207: writes the tab title for every page and records the visit for the
 * menu's "Recentes". Mounted once in the app layout.
 *
 * A screen with a fixed name gets it from the menu (`routeTitle`); a detail
 * page names itself with `usePageTitle` once its record loads, and until then
 * it is neither titled nor remembered — a "Recentes" row that says "Carregando"
 * would be worse than none. Home is not a "recent": it is always first in the
 * menu already.
 */
export function DocumentTitle() {
  const pathname = usePathname();
  const override = useTitleOverride(pathname);
  const title = override ?? routeTitle(pathname);

  useEffect(() => {
    document.title = formatDocumentTitle(title);
    if (title && pathname !== HOME.href) recordRecent({ href: pathname, label: title });
  }, [pathname, title]);

  return null;
}
