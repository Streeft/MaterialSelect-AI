"use client";

import { useState, type DragEvent } from "react";
import type { MaterialClass } from "@/lib/types";
import { descendantIds } from "@/components/admin/MoveClassDialog";

/** What a row of the tree can be dropped onto: another class, or the root strip. */
export type DropTarget = number | "root";

/**
 * Drag-and-drop for the Admin's class tree (D-236): native HTML5 drag, no library, like
 * `useReorder` (D-206). Dragging a class onto another makes it that class's subclass; dragging it
 * onto the "Classe raiz" strip makes it a root. The gesture only *proposes* the move: `onMove`
 * calls `PATCH /api/classes/{id}` (parent only), which keeps the cycle check — the targets that
 * would close one (the class itself and everything under it) are simply not offered here, as the
 * "Mover para…" list does not offer them, and the server still refuses one that gets through.
 *
 * Touch screens have no HTML5 drag and keyboards have no gesture, so "Mover para…" stays the
 * other way to make the same move.
 */
export function useClassDrag({
  classes,
  onMove,
}: {
  classes: MaterialClass[];
  onMove: (cls: MaterialClass, target: DropTarget) => void;
}) {
  const [dragged, setDragged] = useState<MaterialClass | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);

  const blocked = dragged ? descendantIds(dragged, classes) : null;
  const accepts = (target: DropTarget) =>
    dragged !== null && (target === "root" || !blocked?.has(target));

  function end() {
    setDragged(null);
    setOver(null);
  }

  /** On the grip of a row. */
  function handleProps(cls: MaterialClass) {
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(cls.id));
        setDragged(cls);
      },
      onDragEnd: end,
    };
  }

  /** On whatever receives the drop: a row (`target` = its id) or the root strip. */
  function dropProps(target: DropTarget) {
    return {
      "data-dragged": dragged !== null && target === dragged.id ? "" : undefined,
      "data-drop-target": over === target && accepts(target) ? "" : undefined,
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!accepts(target)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(target);
      },
      onDragLeave: () => {
        if (over === target) setOver(null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        const moving = dragged;
        end();
        if (moving !== null && accepts(target)) onMove(moving, target);
      },
    };
  }

  return { handleProps, dropProps, dragged };
}
