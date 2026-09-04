"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sectionForPath } from "@/lib/design/sections";

/**
 * Writes <html data-section="…"> according to the route.
 *
 * An effect, and nothing more: it's the attribute that makes [data-section]
 * blocks in app/globals.css rewrite --brand-*, --accent, and M3 tokens for the
 * entire tree, including inside @material/web components' shadow DOM. No
 * component needs to know which section it's in.
 *
 * Lives on <html>, not a wrapper, because overlays and dialogs render in a
 * portal outside the content tree — trapped in a wrapper they'd lose the hue and
 * revert to the initial route's in the middle of interaction.
 *
 * Mounts alongside the inline script that decides theme in app/layout.tsx. The
 * first paint comes with the initial route's hue and the effect corrects in the
 * same commit; if that bothers in any case, the layout can write data-section
 * on the server from the same sectionForPath.
 */
export function SectionTheme() {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.dataset.section = sectionForPath(pathname);
  }, [pathname]);

  return null;
}
