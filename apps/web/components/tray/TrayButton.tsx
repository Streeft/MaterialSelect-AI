"use client";

import { ptBR } from "@/lib/i18n";
import { OPEN_TRAY_EVENT, useTray, useTrayAvailable } from "@/lib/tray";
import { IconButton } from "@/components/ui";
import { IconTray } from "@/components/ui/icons";

/**
 * The tray's door (D-258): an icon button that says how many things are in it and opens the
 * panel. Two of them exist — beside the search on a wide screen, in the top bar on a narrow one —
 * and both only ask the one panel (`Tray`, mounted in the app shell) to open.
 *
 * The count is part of the button's name ("Bandeja, 3 itens") and is drawn as a small figure for
 * the eye; while the tray has not loaded there is no figure, never a "0".
 */
export function TrayButton(props: { size?: "sm" | "md" }) {
  return useTrayAvailable() ? <TrayButtonInner {...props} /> : null;
}

function TrayButtonInner({ size }: { size?: "sm" | "md" }) {
  const tray = useTray();
  const count = tray.data?.items.length;
  return (
    <span className="relative inline-flex">
      <IconButton
        size={size}
        label={count === undefined ? ptBR.tray.title : ptBR.tray.open(count)}
        icon={<IconTray />}
        aria-haspopup="dialog"
        onClick={() => window.dispatchEvent(new Event(OPEN_TRAY_EVENT))}
      />
      {count ? (
        <span aria-hidden className="ds-tray-count">
          {count}
        </span>
      ) : null}
    </span>
  );
}
