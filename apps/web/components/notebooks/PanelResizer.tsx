"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

const STEP = 16;

/**
 * The vertical handle between two workspace panels (D-143).
 *
 * WAI-ARIA window splitter: a focusable `separator` with `aria-valuenow` (the
 * width of the panel it sizes, in px), moved by the arrows, Home and End as well
 * as by dragging. `direction` is which way a rightward move goes for that panel:
 * +1 widens the panel on its left (Fontes), -1 narrows the one on its right
 * (Estúdio). Desktop only — below `lg` one panel shows at a time and there is
 * nothing to split.
 */
export function PanelResizer({
  label,
  value,
  min,
  max,
  direction,
  onResize,
  onReset,
}: {
  label: string;
  /** The current width of the sized panel, read from the DOM by the parent. */
  value: number;
  min: number;
  max: number;
  direction: 1 | -1;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width: value };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(
      clamp(drag.current.width + direction * (event.clientX - drag.current.x)),
    );
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move: Record<string, number> = { ArrowRight: STEP, ArrowLeft: -STEP };
    if (event.key in move) {
      event.preventDefault();
      onResize(clamp(value + direction * (move[event.key] ?? 0)));
    } else if (event.key === "Home") {
      event.preventDefault();
      onResize(min);
    } else if (event.key === "End") {
      event.preventDefault();
      onResize(max);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onReset();
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        "group hidden w-3 shrink-0 cursor-col-resize touch-none justify-center lg:flex",
        "focus-visible:outline-none",
      )}
    >
      <span className="h-full w-0.5 rounded-full bg-transparent group-hover:bg-edge-control group-focus-visible:bg-accent group-focus-visible:w-1" />
    </div>
  );
}
