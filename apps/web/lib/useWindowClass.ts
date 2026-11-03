import { useSyncExternalStore } from "react";
import { WINDOW_CLASSES, type WindowClass, mediaQueryFor } from "@/lib/design/breakpoints";

function queries(): MediaQueryList[] {
  return WINDOW_CLASSES.slice(1).map((name) => window.matchMedia(mediaQueryFor(name)));
}

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const lists = queries();
  // Safari before 14 only has the old `addListener`; a page there must not
  // break because a popover asked which window it is in (D-197).
  lists.forEach((list) =>
    typeof list.addEventListener === "function"
      ? list.addEventListener("change", onChange)
      : list.addListener?.(onChange),
  );
  return () =>
    lists.forEach((list) =>
      typeof list.removeEventListener === "function"
        ? list.removeEventListener("change", onChange)
        : list.removeListener?.(onChange),
    );
}

function snapshot(): WindowClass {
  if (typeof window.matchMedia !== "function") return "expanded";
  const lists = queries();
  let found: WindowClass = "compact";
  lists.forEach((list, i) => {
    if (list.matches) found = WINDOW_CLASSES[i + 1]!;
  });
  return found;
}

/**
 * The M3 window class of the browser window (D-182), for *behaviour* that
 * depends on it: whether a panel starts open, whether opening a detail
 * navigates or fills a pane. Layout itself is CSS (`PaneScaffold`), so the
 * first paint never waits on this. The server snapshot is "expanded": the
 * desktop layout, which CSS corrects on a phone before anything is read.
 */
export function useWindowClass(): WindowClass {
  return useSyncExternalStore(subscribe, snapshot, () => "expanded");
}
