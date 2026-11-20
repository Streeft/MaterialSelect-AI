"use client";

import Link from "next/link";
import { useEffect, useState, type DragEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearTray, putTrayItems, removeTrayItem, updateTrayItem } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { encodeIdList } from "@/lib/idList";
import { ptBR } from "@/lib/i18n";
import {
  OPEN_TRAY_EVENT,
  TRAY_DRAG_EVENT,
  benchDestinations,
  carriesTrayTarget,
  readTrayDrag,
  trayMaterials,
  useTray,
  useTrayWrite,
} from "@/lib/tray";
import type { TrayCompartment, TrayItem, TrayItemInput } from "@/lib/types";
import { useAnnounce } from "@/components/ui/Announcer";
import {
  Alert,
  Button,
  ButtonLink,
  ErrorState,
  LoadingState,
  MenuButton,
  MenuItem,
  SidePeek,
} from "@/components/ui";
import { IconPlus, IconTray } from "@/components/ui/icons";
import { useTakeToTray } from "./AddToTray";

const t = ptBR.tray;
const COMPARTMENTS: readonly TrayCompartment[] = ["material", "fixacao", "ferramenta"];

/** What puts an item back as it was: its target and the compartment it sat in. */
function asInput(item: TrayItem): TrayItemInput {
  const where = { compartment: item.compartment };
  if (item.kind === "material") return { material_id: item.record_id!, ...where };
  if (item.kind === "process") return { process_id: item.record_id!, ...where };
  return { tool: item.tool!, ...where };
}

function TrayRow({
  item,
  onMove,
  onRemove,
  onOpen,
}: {
  item: TrayItem;
  onMove: (to: TrayCompartment) => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const other: TrayCompartment | null =
    item.kind !== "material" ? null : item.compartment === "material" ? "fixacao" : "material";
  const router = useRouter();
  // D-259: from the panel a material goes to the bench by a command — the panel is modal, so
  // nothing can be dragged out of it. Each destination is a link the screen already reads.
  const destinations = item.kind === "material" && !item.unavailable ? benchDestinations(item.record_id!) : [];
  return (
    <li className="ds-tray-item">
      <span className="flex min-w-0 flex-1 flex-col">
        {item.href ? (
          <Link href={item.href} onClick={onOpen} className="touch-target break-words text-body font-semibold text-brand-700">
            {item.name}
          </Link>
        ) : (
          <span className="break-words text-body font-semibold text-ink">{item.name}</span>
        )}
        {item.unavailable ? (
          <span className="text-caption text-ink-muted">{t.unavailable}</span>
        ) : item.detail ? (
          <span className="text-caption text-ink-muted">{item.detail}</span>
        ) : null}
      </span>
      <MenuButton label={t.itemMenu(item.name)} iconOnly icon={<span aria-hidden>⋯</span>}>
        {destinations.map((destination) => (
          <MenuItem
            key={destination.key}
            onSelect={() => {
              onOpen();
              router.push(destination.href);
            }}
          >
            {t.takeTo[destination.key]}
          </MenuItem>
        ))}
        {other ? <MenuItem onSelect={() => onMove(other)}>{t.moveTo(t.compartments[other])}</MenuItem> : null}
        <MenuItem onSelect={onRemove}>{t.remove}</MenuItem>
      </MenuButton>
    </li>
  );
}

/**
 * The tray (D-258), mounted once in the app shell: the panel that `TrayButton` opens, and the
 * zone that appears at the edge of the screen while something that can be carried is dragged.
 *
 * It only lists and commands. What is in the tray, where each thing opens and which calculators
 * can be carried all come from `GET /api/tray`; each write stores the tray the server answers.
 */
export function Tray() {
  // Open *on a route*: following a link inside the panel changes the route, and the panel is then
  // closed without an effect having to say so.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState<{ message: string; undo?: () => void } | null>(null);
  const pathname = usePathname();
  const open = openAt !== null && openAt === pathname;
  const setOpen = (next: boolean) => setOpenAt(next ? window.location.pathname : null);
  const tray = useTray();
  const write = useTrayWrite();
  const { take } = useTakeToTray();
  const announce = useAnnounce();

  useEffect(() => {
    const onOpen = () => setOpenAt(window.location.pathname);
    const onDrag = (event: Event) => {
      const active = Boolean((event as CustomEvent<boolean>).detail);
      setDragging(active);
      if (!active) setOver(false);
    };
    window.addEventListener(OPEN_TRAY_EVENT, onOpen);
    window.addEventListener(TRAY_DRAG_EVENT, onDrag);
    return () => {
      window.removeEventListener(OPEN_TRAY_EVENT, onOpen);
      window.removeEventListener(TRAY_DRAG_EVENT, onDrag);
    };
  }, []);

  const items = tray.data?.items ?? [];
  const carried = new Set(items.filter((item) => item.kind === "tool").map((item) => item.tool));
  const freeTools = (tray.data?.tools ?? []).filter((tool) => !carried.has(tool.slug));
  const materials = trayMaterials(tray.data);

  // What just left, said inside the panel with its "Desfazer". The panel is modal: the app's
  // snackbar would sit behind it, out of reach of the mouse and of the keyboard alike.
  const notify = (message: string, undo?: () => void) => {
    setNotice({ message, undo });
    announce(message);
  };

  /** Out at once; "Desfazer" puts the same thing back in the compartment it was in. */
  const remove = (item: TrayItem) =>
    write.mutate(() => removeTrayItem(item.id), {
      onSuccess: () =>
        notify(
          t.removed(item.name),
          item.unavailable ? undefined : () => write.mutate(() => putTrayItems([asInput(item)])),
        ),
    });

  const clear = () => {
    const before = items.filter((item) => !item.unavailable).map(asInput);
    write.mutate(() => clearTray(), {
      onSuccess: () =>
        notify(t.cleared, before.length > 0 ? () => write.mutate(() => putTrayItems(before)) : undefined),
    });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    setOver(false);
    const target = readTrayDrag(event);
    if (target) take([target]);
  };

  return (
    <>
      {dragging ? (
        <div
          role="region"
          aria-label={t.dropHere}
          data-over={over}
          className="ds-tray-drop"
          onDragOver={(event) => {
            if (!carriesTrayTarget(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <IconTray className="h-5 w-5" />
          {t.dropHere}
        </div>
      ) : null}

      <SidePeek open={open} title={t.title} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-5">
          <p className="text-support text-ink-muted">{t.hint}</p>
          {write.isError ? (
            <Alert tone="danger" role="alert">
              {describeApiError(write.error, t.writeError)}
            </Alert>
          ) : null}
          {notice ? (
            <div className="well flex flex-wrap items-center gap-2">
              <p role="status" className="min-w-0 flex-1 text-support text-ink">
                {notice.message}
              </p>
              {notice.undo ? (
                <Button
                  size="sm"
                  variant="tonal"
                  onClick={() => {
                    notice.undo?.();
                    setNotice(null);
                  }}
                >
                  {ptBR.snackbar.undo}
                </Button>
              ) : null}
            </div>
          ) : null}

          {tray.isPending ? (
            <LoadingState label={t.loading} />
          ) : tray.isError ? (
            <ErrorState title={t.error} error={tray.error} onRetry={() => void tray.refetch()} />
          ) : (
            <>
              {items.length === 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="text-body font-semibold text-ink">{t.empty}</p>
                  <p className="text-support text-ink-muted">{t.emptyHint}</p>
                </div>
              ) : null}

              {COMPARTMENTS.map((compartment) => {
                const inside = items.filter((item) => item.compartment === compartment);
                return (
                  <section key={compartment} aria-label={t.compartments[compartment]} className="flex flex-col gap-2">
                    <h3 className="text-support font-semibold text-ink">{t.compartments[compartment]}</h3>
                    {inside.length === 0 ? (
                      <p className="text-support text-ink-muted">{t.compartmentEmpty[compartment]}</p>
                    ) : (
                      <ul className="ds-tray-compartment">
                        {inside.map((item) => (
                          <TrayRow
                            key={item.id}
                            item={item}
                            onOpen={() => setOpen(false)}
                            onMove={(to) => {
                              setNotice(null);
                              write.mutate(() => updateTrayItem(item.id, { compartment: to }));
                            }}
                            onRemove={() => remove(item)}
                          />
                        ))}
                      </ul>
                    )}
                    {compartment === "ferramenta" ? (
                      freeTools.length > 0 ? (
                        <MenuButton label={t.addTool} icon={<IconPlus />} className="self-start">
                          {freeTools.map((tool) => (
                            <MenuItem
                              key={tool.slug}
                              onSelect={() => write.mutate(() => putTrayItems([{ tool: tool.slug }]))}
                            >
                              {tool.label}
                            </MenuItem>
                          ))}
                        </MenuButton>
                      ) : (
                        <p className="text-caption text-ink-muted">{t.addToolEmpty}</p>
                      )
                    ) : null}
                  </section>
                );
              })}

              {items.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-line-divider pt-4">
                  {materials.length >= 2 ? (
                    <ButtonLink
                      size="sm"
                      variant="secondary"
                      href={`/app/comparar?materiais=${encodeIdList(materials.map((item) => item.record_id!))}`}
                    >
                      {t.compare}
                    </ButtonLink>
                  ) : null}
                  <Button size="sm" variant="ghost" disabled={write.isPending} onClick={clear}>
                    {t.clear}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </SidePeek>
    </>
  );
}
