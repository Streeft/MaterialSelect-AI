"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { MaterialClass } from "@/lib/types";
import { descendantIds } from "@/components/admin/MoveClassDialog";

/** What a row of the tree can be dropped onto: another class, or the root strip. */
export type DropTarget = number | "root";

/** The attribute a drop target carries so the pointer can find it under the finger. */
const TARGET_ATTR = "data-drop-id";

/** The drop target under a point: the nearest ancestor that carries `data-drop-id`. */
function targetAt(x: number, y: number): DropTarget | null {
  const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>(`[${TARGET_ATTR}]`);
  const raw = hit?.getAttribute(TARGET_ATTR);
  if (raw == null) return null;
  return raw === "root" ? "root" : Number(raw);
}

/**
 * Drag-and-drop for the Admin's class tree (D-236, D-244): pointer events, no library, so the same
 * gesture works with a mouse, a pen and a finger (the HTML5 drag of D-236 does not exist on touch
 * screens). Pressing the grip of a row starts the drag; the element under the pointer (found with
 * `elementFromPoint`, since a touch keeps its first target) is the candidate; releasing over a row
 * makes the dragged class that row's subclass, and releasing over the "Classe raiz" strip makes it
 * a root. The gesture only *proposes* the move: `onMove` calls `PATCH /api/classes/{id}` (parent
 * only), which keeps the cycle check — the targets that would close one (the class itself and
 * everything under it) are simply not offered here, as the "Mover para…" list does not offer them,
 * and the server still refuses one that gets through. Escape and a cancelled pointer drop nothing.
 *
 * Keyboards have no gesture, so "Mover para…" stays the other way to make the same move.
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

  // The listeners live as long as a drag does; they are re-attached when what they read changes.
  useEffect(() => {
    if (dragged === null) return;
    const moving = dragged;
    const allowed = (target: DropTarget | null): target is DropTarget =>
      target !== null && (target === "root" || !blocked?.has(target));
    function end() {
      setDragged(null);
      setOver(null);
    }
    function onPointerMove(event: PointerEvent) {
      const target = targetAt(event.clientX, event.clientY);
      setOver(allowed(target) ? target : null);
    }
    function onPointerUp(event: PointerEvent) {
      const target = targetAt(event.clientX, event.clientY);
      end();
      if (allowed(target)) onMove(moving, target);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") end();
    }
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", end);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", end);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dragged, blocked, onMove]);

  /** On the grip of a row. `.ds-grip-pointer` sets `touch-action: none`, which keeps the page from scrolling under the finger. */
  function handleProps(cls: MaterialClass) {
    return {
      className: "ds-block-grip ds-grip-pointer",
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        // Only the primary button of a mouse; a finger or a pen always has button 0.
        if (event.button !== 0) return;
        event.preventDefault();
        setDragged(cls);
        setOver(null);
      },
    };
  }

  /** On whatever receives the drop: a row (`target` = its id) or the root strip. */
  function dropProps(target: DropTarget) {
    return {
      [TARGET_ATTR]: String(target),
      "data-dragged": dragged !== null && target === dragged.id ? "" : undefined,
      "data-drop-target": over === target && accepts(target) ? "" : undefined,
    };
  }

  return { handleProps, dropProps, dragged };
}
