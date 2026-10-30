"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { IconPlus } from "./icons";

export interface FabMenuAction {
  label: string;
  onSelect: () => void;
}

/**
 * The M3 Expressive FAB menu (D-183; m3.material.io › Components › FAB menu):
 * a FAB that opens two to six related actions, and turns into the button that
 * closes them. It replaces a stack of small FABs.
 *
 * The FAB is tonal (`primary-container`) at rest, so it is not the screen's
 * one primary action (D-91, D-134). Not modal: Escape, a click outside or
 * choosing an action closes it, and focus goes back to the FAB. Arrow keys,
 * Home and End move between the actions. Placement is the caller's.
 */
export function FabMenu({
  label,
  actions,
  className,
}: {
  /** The FAB's visible text and the menu's accessible name. */
  label: string;
  actions: FabMenuAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    fabRef.current?.focus();
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
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
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn("m3-fabmenu", className)}>
      <button
        ref={fabRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="m3-fabmenu-fab"
      >
        <IconPlus aria-hidden className="h-5 w-5" />
        <span>{label}</span>
      </button>
      {open ? (
        <ul ref={listRef} id={menuId} role="menu" aria-label={label} className="m3-fabmenu-list" onKeyDown={onListKeyDown}>
          {actions.map((action, i) => (
            <li key={action.label} role="none">
              <button
                type="button"
                role="menuitem"
                className="m3-fabmenu-item"
                style={{ ["--i" as string]: i }}
                onClick={() => {
                  close();
                  action.onSelect();
                }}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
