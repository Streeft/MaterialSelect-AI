"use client";

import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { useAnnounce } from "./Announcer";
import { IconEyeOff, IconGrip } from "./icons";

const t = ptBR.ds;

/** Move the item at `from` to `to`, returning a new array (the input is not touched). */
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/**
 * D-206: the one way a list is reordered by hand, Notion's block in M3's terms.
 *
 * Three inputs for the same move, so none is the only door: drag the grip
 * (HTML5 native drag, no library, as D-191's `ExpressionBuilder`), or focus the
 * grip and press Alt + ↑/↓, the shortcut Notion and Google Docs use for "move
 * block". Every move is announced (D-146), because a list that reorders under a
 * screen reader without a word is a list that silently changed.
 *
 * The hook owns only the gesture. The order itself lives with the caller, who
 * decides where it is kept (a study, an account, the device) — this file never
 * writes to storage.
 */
export function useReorder<T>({
  items,
  onReorder,
  nameOf,
}: {
  items: readonly T[];
  onReorder: (next: T[]) => void;
  /** What the item is called, for the grip's name and the announcement. */
  nameOf: (item: T, index: number) => string;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const announce = useAnnounce();

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const item = items[from];
    if (item === undefined) return;
    onReorder(reorder(items, from, to));
    announce(t.moved(nameOf(item, from), to + 1, items.length));
  }

  function handleProps(index: number) {
    const item = items[index];
    const name = item === undefined ? "" : nameOf(item, index);
    return {
      draggable: true,
      role: "button" as const,
      tabIndex: 0,
      "aria-label": t.dragHandle(name),
      title: t.dragHint,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
        setDragged(index);
      },
      onDragEnd: () => {
        setDragged(null);
        setOver(null);
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (!event.altKey) return;
        if (event.key === "ArrowUp") {
          event.preventDefault();
          move(index, index - 1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          move(index, index + 1);
        }
      },
    };
  }

  function itemProps(index: number) {
    return {
      "data-dragged": dragged === index ? "" : undefined,
      "data-drop-target": over === index && dragged !== null && dragged !== index ? "" : undefined,
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragged === null || dragged === index) return;
        event.preventDefault();
        setOver(index);
      },
      onDragLeave: () => {
        if (over === index) setOver(null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (dragged !== null) move(dragged, index);
        setDragged(null);
        setOver(null);
      },
    };
  }

  return { handleProps, itemProps, move, dragged };
}

type ReorderProps = ReturnType<ReturnType<typeof useReorder>["handleProps"]>;
type ItemProps = ReturnType<ReturnType<typeof useReorder>["itemProps"]>;

/**
 * A movable row: the grip appears on hover or focus (always on a touch screen,
 * where there is no hover), the content fills the rest, and an optional eye
 * hides the block without removing it — the "toggle" of a dashboard tile.
 */
export function Block({
  name,
  handle,
  item,
  hidden = false,
  onToggleHidden,
  actions,
  className,
  children,
}: {
  /** The block's name: the grip's and the hide button's accessible names. */
  name: string;
  handle: ReorderProps;
  item: ItemProps;
  hidden?: boolean;
  onToggleHidden?: () => void;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      {...item}
      data-hidden={hidden ? "" : undefined}
      className={cn("ds-block group", className)}
    >
      <span {...handle} className="ds-block-grip touch-target">
        <IconGrip className="h-4 w-4" aria-hidden />
      </span>
      <div className={cn("min-w-0 flex-1", hidden && "opacity-60")}>
        {hidden ? <span className="text-caption text-ink-muted">{t.hiddenBlock} · </span> : null}
        {children}
      </div>
      {actions || onToggleHidden ? (
        <div className="ds-block-actions">
          {actions}
          {onToggleHidden ? (
            <button
              type="button"
              className="msds-icon-btn msds-icon-btn-standard msds-icon-btn-sm msds-ripple-host"
              aria-pressed={hidden}
              aria-label={hidden ? t.showBlock(name) : t.hideBlock(name)}
              title={hidden ? t.showBlock(name) : t.hideBlock(name)}
              onClick={onToggleHidden}
            >
              <IconEyeOff aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
