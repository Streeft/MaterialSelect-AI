"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { sectionForPath } from "@/lib/design/sections";
import { paletteSection, readAppearance, serverAppearance, subscribeAppearance } from "@/lib/appearance";

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
 *
 * D-196: a reader who chose one colour for the whole app wears that palette on
 * every route instead (`paletteSection`); the head script already wrote it
 * before paint, so this only keeps it there as routes change.
 */
export function SectionTheme() {
  const pathname = usePathname();
  const { color } = useSyncExternalStore(subscribeAppearance, readAppearance, serverAppearance);

  useEffect(() => {
    // Read the store, not `color`: while hydrating, the hook still returns the
    // server's "route", and writing that would undo the head script for a frame.
    document.documentElement.dataset.section = paletteSection(readAppearance().color, sectionForPath(pathname));
  }, [pathname, color]);

  return null;
}
