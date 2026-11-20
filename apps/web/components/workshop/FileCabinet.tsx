"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchMaterials, type CatalogQuery } from "@/lib/api";
import { ORIGIN_ATTRIBUTE, markContainerOrigin } from "@/lib/containerTransition";
import { ptBR } from "@/lib/i18n";
import type { MaterialListItem } from "@/lib/types";
import { QualityBar } from "@/components/catalog/MaterialRows";
import { Button, ButtonLink, ErrorState, ToggleChip, LoadingState } from "@/components/ui";
import { TakeToTrayButton } from "@/components/tray/AddToTray";
import { trayDragProps, type TrayTarget } from "@/lib/tray";

const t = ptBR.catalog.cabinet;

/** How many envelopes an open drawer shows; the rest is one click away, in the family's page. */
export const DRAWER_PAGE_SIZE = 12;

/**
 * One drawer of the cabinet (D-256): a wooden front with a paper label and a pull, and the tray
 * behind it. A disclosure and nothing more exotic — a button with `aria-expanded` that owns a
 * region — so it works by keyboard and reads the same as any other section that folds.
 *
 * Nothing is written on the wood: the name and the count sit on the label, which is paper.
 */
export function Drawer({
  name,
  count,
  open,
  onToggle,
  children,
}: {
  name: string;
  /** Already in words ("3 materiais"); omitted while the server has not answered. */
  count?: string;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="oficina-drawer" data-open={open}>
      <button
        type="button"
        className="oficina-drawer-front"
        aria-expanded={open}
        aria-controls={`${id}-tray`}
        onClick={onToggle}
      >
        <span className="oficina-drawer-label">
          <span className="break-words text-body font-semibold text-ink">{name}</span>
          {count ? <span className="text-caption text-ink-muted">{count}</span> : null}
        </span>
        <span aria-hidden className="oficina-drawer-pull" />
      </button>
      {open ? (
        <div id={`${id}-tray`} role="region" aria-label={t.tray(name)} className="oficina-drawer-body">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One material, as an envelope in the tray: what the list already knows about it — the name, the
 * subfamily and how much of its data is measured, imported, estimated or absent. No property value
 * is shown here: the search does not carry one, and an envelope must not invent it.
 */
export function Envelope({ material }: { material: MaterialListItem }) {
  // D-258: an envelope can be carried — dragged to the tray, or taken with the button beside its
  // name, which is the same command for the keyboard and the touch screen.
  const target: TrayTarget = { kind: "material", id: material.id, name: material.name };
  return (
    <li className="oficina-envelope" data-tray-carry {...trayDragProps(target)} {...{ [ORIGIN_ATTRIBUTE]: "" }}>
      <span className="flex items-start gap-2">
        <Link
          href={`/app/materiais/${material.id}`}
          onClick={markContainerOrigin}
          // The envelope is what is dragged, not the link's address.
          draggable={false}
          className="touch-target min-w-0 flex-1 break-words text-body font-semibold text-brand-700"
        >
          {material.name}
        </Link>
        <TakeToTrayButton target={target} />
      </span>
      {material.subclass ? <span className="text-caption text-ink-muted">{material.subclass}</span> : null}
      <QualityBar quality={material.quality} />
    </li>
  );
}

/** The tray of one family: its subfamilies as dividers and the first envelopes, from the server. */
function FamilyTray({
  slug,
  name,
  base,
  onFilter,
}: {
  slug: string;
  name: string;
  base: CatalogQuery;
  onFilter: () => void;
}) {
  const [subclass, setSubclass] = useState<string | null>(null);
  const question: CatalogQuery = {
    ...base,
    classe: slug,
    subclasse: subclass,
    ordenar: "nome",
    direcao: "asc",
    limit: DRAWER_PAGE_SIZE,
    offset: 0,
    facetas: true,
  };
  const drawer = useQuery({
    queryKey: ["materials", "gaveta", question],
    queryFn: () => searchMaterials(question),
    placeholderData: (previous) => previous,
  });

  if (drawer.isLoading) return <LoadingState label={t.loading} />;
  if (drawer.isError) {
    return <ErrorState title={t.error} error={drawer.error} onRetry={() => void drawer.refetch()} />;
  }
  const items = drawer.data?.items ?? [];
  const total = drawer.data?.total ?? 0;
  // The dividers come from the drawer's own answer, so none of them leads to an empty tray.
  const dividers = Object.entries(drawer.data?.facets?.subclasse ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"));

  return (
    <>
      {dividers.length > 1 || subclass ? (
        <div role="group" aria-label={t.dividers(name)} className="flex flex-wrap gap-2">
          <ToggleChip selected={subclass === null} onClick={() => setSubclass(null)}>
            {t.allDividers}
          </ToggleChip>
          {dividers.map(([divider, n]) => (
            <ToggleChip
              key={divider}
              selected={subclass === divider}
              onClick={() => setSubclass(subclass === divider ? null : divider)}
            >
              {t.divider(divider, n)}
            </ToggleChip>
          ))}
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="text-support text-ink-muted">{t.empty}</p>
      ) : (
        <ul aria-label={t.envelopes(name)} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((material) => (
            <Envelope key={material.id} material={material} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p role="status" className="mr-auto text-caption text-ink-muted">
          {t.shown(items.length, total)}
        </p>
        <Button size="sm" variant="ghost" onClick={onFilter}>
          {t.filterList}
        </Button>
        <ButtonLink size="sm" variant="secondary" href={`/app/catalogo/${slug}`}>
          {t.openFamily(name)}
        </ButtonLink>
      </div>
    </>
  );
}

export interface CabinetFamily {
  slug: string;
  name: string;
}

/**
 * The Catálogo as a filing cabinet (D-256, "Oficina" ambience): one drawer per family of the
 * taxonomy, one open at a time. It stands where the family cards stand in "Engenharia" and
 * answers from the same sources — the roots of the class list and the server's counts — so the
 * two ambiences can never disagree about what the catalogue holds.
 */
export function FileCabinet({
  families,
  counts,
  base,
  onFilterFamily,
}: {
  families: CabinetFamily[];
  /** The server's count per family slug, for the current text and chips; `null` until it answers. */
  counts: Record<string, number> | null;
  /** The reader's current question (text and chips), which each drawer narrows to its family. */
  base: CatalogQuery;
  onFilterFamily: (slug: string) => void;
}) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  return (
    <div className="oficina-cabinet">
      {families.map((family) => {
        const open = openSlug === family.slug;
        return (
          <Drawer
            key={family.slug}
            name={family.name}
            count={counts ? ptBR.family.countMaterials(counts[family.slug] ?? 0) : undefined}
            open={open}
            onToggle={() => setOpenSlug(open ? null : family.slug)}
          >
            <FamilyTray
              slug={family.slug}
              name={family.name}
              base={base}
              onFilter={() => onFilterFamily(family.slug)}
            />
          </Drawer>
        );
      })}
    </div>
  );
}
