"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { IconChevronDown } from "./icons";

const GAP = 6;
const MARGIN = 8;
const MIN_WIDTH = 200;

interface MenuContextValue {
  close: (restoreFocus: boolean) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

/**
 * One button that opens a short list of related actions (D-91).
 *
 * It exists for the verbs that are not the screen's point but still belong on
 * it — "export as CSV / XLSX / DOCX / HTML", "export as PNG / SVG". Laid out
 * as a row of buttons they competed with the one action a screen is for; in a
 * menu they cost one button's width and say "there is more here" once.
 *
 * WAI-ARIA menu button: `aria-haspopup="menu"` and `aria-expanded` on the
 * trigger; the list is `role="menu"` of `role="menuitem"`. Opening moves focus
 * to the first item, arrows and Home/End move within the list, Escape closes
 * and returns focus to the trigger, Tab closes and moves on from the trigger.
 *
 * The list is portalled and positioned `fixed`, like `Popover`: the triggers
 * live in table rows (saved studies) and chart cards, both of which clip an
 * absolutely positioned child with their own overflow.
 */
export function MenuButton({
  label,
  icon,
  size = "sm",
  disabled = false,
  align = "end",
  iconOnly = false,
  className,
  children,
}: {
  /** The trigger's visible text — also the menu's accessible name. */
  label: string;
  /**
   * D-94: a round icon button (a figure's corner). The label stays the
   * button's and the menu's accessible name, and shows as the native title.
   */
  iconOnly?: boolean;
  icon?: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
  align?: "start" | "end";
  className?: string;
  /** `MenuItem`s. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const triggerId = useId();

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(MIN_WIDTH, menuRef.current?.offsetWidth ?? MIN_WIDTH);
    const left = align === "end" ? rect.right - width : rect.left;
    const above = rect.bottom > window.innerHeight * 0.7;
    setPosition({
      top: above ? rect.top - GAP : rect.bottom + GAP,
      left: Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN)),
      above,
    });
  }, [align]);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  // Focus the first item once, when the list opens — the keyboard reader
  // asked for the menu, so they land inside it. Only on opening: a scroll
  // re-places the list, and must not pull focus back to the first item.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])',
    );
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
    };
    const onScrollOrResize = () => place();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, place, close]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        // Back to the trigger first, without preventing the default: the
        // browser then moves on from the trigger, not from the end of <body>
        // where the portalled list lives.
        close(true);
        break;
    }
  }

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <MenuContext.Provider value={{ close }}>
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-labelledby={triggerId}
              onKeyDown={onMenuKeyDown}
              style={{
                position: "fixed",
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                minWidth: MIN_WIDTH,
                transform: position?.above ? "translateY(-100%)" : undefined,
              }}
              className="msds-menu z-50"
            >
              {children}
            </div>
          </MenuContext.Provider>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        title={iconOnly ? label : undefined}
        className={cn(
          iconOnly ? "chart-icon-btn chart-icon-btn-solo" : "msds-btn msds-btn-secondary",
          !iconOnly && `msds-btn-${size}`,
          className,
        )}
      >
        {icon ? (
          <span className="inline-flex shrink-0 items-center" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className={iconOnly ? "sr-only" : "msds-btn-label"}>{label}</span>
        {iconOnly ? null : (
          <IconChevronDown
            aria-hidden
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
          />
        )}
      </button>
      {menu}
    </>
  );
}

/**
 * One entry of a `MenuButton`. With `href` it is a link (a download, or a page
 * that opens in a new tab) — navigation stays a real `<a>` so the browser's
 * own save dialog and "open in new tab" still work; without it, a button.
 */
export function MenuItem({
  onSelect,
  href,
  download,
  target,
  rel,
  title,
  disabled = false,
  hint,
  children,
}: {
  onSelect?: () => void;
  href?: string;
  download?: boolean;
  target?: string;
  rel?: string;
  title?: string;
  disabled?: boolean;
  /** A second, quieter line: what the entry produces. */
  hint?: ReactNode;
  children: ReactNode;
}) {
  const menu = useContext(MenuContext);
  const content = (
    <span className="flex min-w-0 flex-col items-start">
      <span>{children}</span>
      {hint ? <span className="text-caption text-ink-subtle">{hint}</span> : null}
    </span>
  );
  if (href && !disabled) {
    return (
      <a
        role="menuitem"
        tabIndex={-1}
        href={href}
        download={download || undefined}
        target={target}
        rel={rel}
        title={title}
        className="msds-menu-item no-underline"
        onClick={() => menu?.close(false)}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      title={title}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className="msds-menu-item"
      onClick={() => {
        menu?.close(true);
        onSelect?.();
      }}
    >
      {content}
    </button>
  );
}
