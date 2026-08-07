"use client";

import { useEffect, type RefObject } from "react";

/** Everything the browser hands focus to on Tab. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Focus containment for anything modal — dialog, drawer, sheet.
 *
 * One implementation, because the obligations are easy to write and easy to
 * ship three of four: focus enters the container, cannot leave it while it is
 * open, returns to whatever opened it on close, and `Esc` closes. The page
 * behind stops scrolling for the same reason.
 *
 * The container itself takes focus, not its first control: the reader hears the
 * region's name instead of being dropped onto "Fechar", which is what happens
 * when the close button is the first thing in the DOM.
 */
export function useFocusTrap(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    const panel = container.current;
    panel?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      restoreTo?.focus();
    };
  }, [open, container, onClose]);
}
