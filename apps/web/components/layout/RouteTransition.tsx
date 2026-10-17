"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * The screen-to-screen transition (D-141, after the M3 "fade through" pattern).
 *
 * Keyed by the pathname: a new screen is a new subtree that fades in over the
 * `medium1` duration, and a change that stays on the same path (the wizard's
 * `?etapa=`, a filter in the URL) is not a new screen and does not replay it.
 *
 * Opacity only, never `transform`: a transformed ancestor becomes the containing
 * block of every `position: fixed` descendant (the FAB, the comparison tray),
 * which would make them jump for the length of the animation.
 * `prefers-reduced-motion` turns the animation off in `globals.css`.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="m3-route-enter">
      {children}
    </div>
  );
}
