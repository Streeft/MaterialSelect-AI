"use client";

import { ptBR } from "@/lib/i18n";
import { describeApiError } from "@/lib/errors";
import {
  OPEN_TRAY_EVENT,
  isInTray,
  usePutInTray,
  useTray,
  useTrayAvailable,
  type TrayTarget,
} from "@/lib/tray";
import { useAnnounce } from "@/components/ui/Announcer";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import { Button, IconButton } from "@/components/ui";
import { IconTray } from "@/components/ui/icons";

const t = ptBR.tray;

/**
 * "Levar para a bandeja" (D-258), the command behind every way of carrying something. Dragging is
 * one of them and never the only one: wherever a thing can be dragged to the tray, this is beside
 * it, for the keyboard, the screen reader and the touch screen.
 *
 * It says what happened — "foi para a bandeja", "já está na bandeja" or the server's refusal —
 * through the app's snackbar (with a door to the tray) or, without one, the live region.
 */
export function useTakeToTray() {
  const tray = useTray();
  const { put, pending } = usePutInTray();
  const snackbar = useOptionalSnackbar();
  const announce = useAnnounce();

  const say = (message: string, withDoor = true) => {
    if (!snackbar) {
      announce(message);
      return;
    }
    snackbar.notify({
      message,
      action: withDoor
        ? { label: t.show, onAction: () => window.dispatchEvent(new Event(OPEN_TRAY_EVENT)) }
        : undefined,
    });
  };

  const take = (targets: TrayTarget[]) => {
    const fresh = targets.filter((target) => !isInTray(tray.data, target));
    if (fresh.length === 0) {
      say(targets.length === 1 ? t.already(targets[0]!.name) : t.takenMany(0));
      return;
    }
    put(
      fresh,
      () => say(fresh.length === 1 ? t.taken(fresh[0]!.name) : t.takenMany(fresh.length)),
      (error) => say(describeApiError(error, t.writeError), false),
    );
  };

  return { take, pending, has: (target: TrayTarget) => isInTray(tray.data, target) };
}

/**
 * The command as an icon button, for a card or an envelope. Says so when the thing is already
 * there. Not offered where the tray cannot be reached (`useTrayAvailable`).
 */
export function TakeToTrayButton(props: { target: TrayTarget; size?: "sm" | "md" }) {
  return useTrayAvailable() ? <TakeToTrayButtonInner {...props} /> : null;
}

function TakeToTrayButtonInner({ target, size = "sm" }: { target: TrayTarget; size?: "sm" | "md" }) {
  const { take, pending, has } = useTakeToTray();
  const inTray = has(target);
  return (
    <IconButton
      size={size}
      label={inTray ? `${target.name}: ${t.inTray.toLowerCase()}` : t.takeNamed(target.name)}
      icon={<IconTray />}
      aria-pressed={inTray}
      disabled={pending}
      onClick={() => take([target])}
    />
  );
}

/** Several records at once, as a labelled button: the catalogue's marked materials. */
export function TakeManyToTrayButton({ ids }: { ids: readonly number[] }) {
  return useTrayAvailable() ? <TakeManyInner ids={ids} /> : null;
}

function TakeManyInner({ ids }: { ids: readonly number[] }) {
  const { take, pending } = useTakeToTray();
  return (
    <Button
      size="sm"
      variant="tonal"
      disabled={pending}
      onClick={() => take(ids.map((id) => ({ kind: "material" as const, id, name: "" })))}
    >
      {t.takeMany(ids.length)}
    </Button>
  );
}
