"use client";

import { ptBR } from "@/lib/i18n";
import type { ReactNode } from "react";
import { trayDragProps, trayMaterials, useTray, useTrayAvailable, useTrayDrop } from "@/lib/tray";
import type { TrayItem } from "@/lib/types";
import { Button } from "@/components/ui";

/** One thing the page can do with a carried material. */
export interface TrayStripAction {
  /** The short word on the button ("Destacar", "A"). */
  label: string;
  /** The whole sentence, for who does not see the chip beside it. */
  describe: (material: string) => string;
  run: (id: number, name: string) => void;
  /** A toggle says its state (the map's highlight). */
  pressed?: (id: number) => boolean;
  /** Why it cannot be used now; shown as the button's title and it stays focusable. */
  disabledReason?: (id: number) => string | undefined;
}

/**
 * The tray's materials laid on the bench of a screen (D-259): each one can be dragged onto the
 * place the screen marks (`useTrayDrop`), and carries beside it, as buttons, the same things the
 * drop would do — dragging is never the only way (D-146, D-206).
 *
 * It is a marker's list: names and ids. Whatever the screen then shows about the material is the
 * server's answer to the request the action changes. With an empty tray it renders nothing.
 */
export function TrayStrip({ hint, actions }: { hint: string; actions: TrayStripAction[] }) {
  if (!useTrayAvailable()) return null;
  return <Strip hint={hint} actions={actions} />;
}

function Strip({ hint, actions }: { hint: string; actions: TrayStripAction[] }) {
  const carried: TrayItem[] = trayMaterials(useTray().data);
  if (carried.length === 0) return null;
  const t = ptBR.tray;
  return (
    <div role="group" aria-label={t.stripTitle} className="well flex flex-col gap-2">
      <p className="text-support text-ink-muted">
        <span className="font-semibold text-ink">{t.stripTitle}.</span> {hint}
      </p>
      <ul className="flex flex-wrap gap-2">
        {carried.map((item) => {
          const id = item.record_id!;
          return (
            <li
              key={item.id}
              className="ds-tray-chip"
              data-tray-carry
              {...trayDragProps({ kind: "material", id, name: item.name })}
            >
              <span className="min-w-0 break-words">{item.name}</span>
              {actions.map((action) => {
                const reason = action.disabledReason?.(id);
                return (
                  <Button
                    key={action.label}
                    size="sm"
                    variant="ghost"
                    aria-label={action.describe(item.name)}
                    aria-pressed={action.pressed ? action.pressed(id) : undefined}
                    aria-disabled={reason ? true : undefined}
                    title={reason}
                    onClick={() => {
                      if (!reason) action.run(id, item.name);
                    }}
                  >
                    {action.label}
                  </Button>
                );
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A place of the screen that accepts a carried material; the outline shows it while one is over. */
export function TrayDropZone({
  onMaterial,
  className,
  children,
}: {
  onMaterial: (id: number, name: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const drop = useTrayDrop(onMaterial);
  return (
    <div className={className ?? "rounded-card"} {...drop}>
      {children}
    </div>
  );
}
