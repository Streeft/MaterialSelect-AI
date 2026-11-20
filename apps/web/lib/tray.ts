"use client";

import { useContext, type DragEvent } from "react";
import { QueryClientContext, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTray, putTrayItems } from "@/lib/api";
import type { Tray, TrayItem, TrayItemInput } from "@/lib/types";

/**
 * The tray (D-258): what the reader is carrying to the bench — materials, fixings, processes and
 * calculators — kept in the account and at hand on every screen.
 *
 * One cache entry holds it, and every write puts the server's whole answer back there (the
 * `FavoriteButton` pattern), so the button's count, the panel and the strip on a project page
 * cannot disagree. Nothing here is a number about a material: an item is a marker.
 */
export const TRAY_KEY = ["tray"] as const;

export function useTray() {
  return useQuery({ queryKey: TRAY_KEY, queryFn: () => getTray(), staleTime: 30_000 });
}

/**
 * Whether the tray can be reached from here: it lives in the app's query cache, so a piece drawn
 * outside the app shell (a specimen, a component rendered alone) has none. The commands that
 * carry something check this and are simply not offered there — a card must not need the tray to
 * be a card.
 */
export function useTrayAvailable(): boolean {
  return useContext(QueryClientContext) !== undefined;
}

/** A write to the tray: runs it and stores the tray the server answered. */
export function useTrayWrite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<Tray>) => run(),
    onSuccess: (tray) => client.setQueryData(TRAY_KEY, tray),
  });
}

/** What can be carried: a record of the catalogue, named for the notice that follows. */
export interface TrayTarget {
  kind: "material" | "process";
  id: number;
  name: string;
}

export function targetInput(target: TrayTarget): TrayItemInput {
  return target.kind === "material" ? { material_id: target.id } : { process_id: target.id };
}

export function isInTray(tray: Tray | undefined, target: TrayTarget): boolean {
  return Boolean(tray?.items.some((item) => item.kind === target.kind && item.record_id === target.id));
}

/** Puts records in the tray. The caller says what happened (notice, announcement). */
export function usePutInTray() {
  const write = useTrayWrite();
  return {
    pending: write.isPending,
    put: (targets: TrayTarget[], onDone?: (tray: Tray) => void, onError?: (error: unknown) => void) =>
      write.mutate(() => putTrayItems(targets.map(targetInput)), { onSuccess: onDone, onError }),
  };
}

// --- Dragging. HTML5 native, as `Block` and the expression builder do: no library. ---

/** The payload's type. Its content is a `TrayTarget`: a kind, an id and a name, never a value. */
export const TRAY_DRAG_TYPE = "application/x-msai-tray";
/** Fired on `window` when a carryable thing starts (`detail: true`) or stops being dragged. */
export const TRAY_DRAG_EVENT = "msai:tray-drag";
/** Asks the tray's panel to open. */
export const OPEN_TRAY_EVENT = "msai:open-tray";

/**
 * Props that make an element a thing that can be carried. Dragging is never the only way: the
 * same element always offers "Levar para a bandeja" as a command (D-146, D-206).
 */
export function trayDragProps(target: TrayTarget) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(TRAY_DRAG_TYPE, JSON.stringify(target));
      // What another application receives if the drop lands outside the app.
      event.dataTransfer.setData("text/plain", target.name);
      window.dispatchEvent(new CustomEvent(TRAY_DRAG_EVENT, { detail: true }));
    },
    onDragEnd: () => {
      window.dispatchEvent(new CustomEvent(TRAY_DRAG_EVENT, { detail: false }));
    },
  };
}

/** Whether the drag in flight carries something for the tray (readable during `dragover`). */
export function carriesTrayTarget(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes(TRAY_DRAG_TYPE);
}

/** The carried thing, on drop; `null` for anything that is not a well-formed target. */
export function readTrayDrag(event: DragEvent<HTMLElement>): TrayTarget | null {
  try {
    const data = JSON.parse(event.dataTransfer.getData(TRAY_DRAG_TYPE)) as Partial<TrayTarget>;
    if ((data.kind === "material" || data.kind === "process") && Number.isInteger(data.id) && data.id! > 0) {
      return { kind: data.kind, id: data.id!, name: typeof data.name === "string" ? data.name : "" };
    }
  } catch {
    // Not ours.
  }
  return null;
}

/** The materials of the tray that can be used: the ones still readable. */
export function trayMaterials(tray: Tray | undefined): TrayItem[] {
  return (tray?.items ?? []).filter((item) => item.kind === "material" && !item.unavailable);
}
