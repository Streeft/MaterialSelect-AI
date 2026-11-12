/**
 * The browser tab's title per page (D-207).
 *
 * Almost every screen is a client component, so Next's `metadata` export is
 * not available to them. Screens with a fixed name get it from the menu
 * (`routeTitle` in `components/layout/DocumentTitle.tsx`); a detail page —
 * a material, a process, a family, a notebook — names itself with
 * `usePageTitle(name)` once its record has loaded. The override carries the
 * path it was set on, so a title can never outlive its page by a frame and
 * label the next one.
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ptBR } from "@/lib/i18n";

interface Override {
  path: string;
  title: string;
}

let current: Override | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** The name this page gave itself, if it gave one. `null` while it loads. */
export function usePageTitle(title: string | null | undefined): void {
  const path = usePathname();
  useEffect(() => {
    if (!title) return;
    const token: Override = { path, title };
    current = token;
    notify();
    return () => {
      if (current === token) {
        current = null;
        notify();
      }
    };
  }, [path, title]);
}

/** The override for `path`, ignoring one left by another page. */
export function useTitleOverride(path: string): string | null {
  const override = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return override && override.path === path ? override.title : null;
}

/** "Mapas · MaterialSelect AI", or just the product name. */
export function formatDocumentTitle(title: string | null | undefined): string {
  return title ? `${title} · ${ptBR.appName}` : ptBR.appName;
}
