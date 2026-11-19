"use client";

import { useMemo, type ReactNode } from "react";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { MaterialCards, type CardSelection } from "./MaterialCards";
import {
  MaterialTable,
  SelectionBar,
  type CatalogColumn,
  type CrossPageSelection,
  type PreviewRequest,
  type ServerSort,
} from "./MaterialRows";

/**
 * D-254: the boxes on the cards (the phone's stand-in for the table, and the gallery) and the one
 * bar for what they mark, from the selection the page owns (D-232). Until now only the table had
 * the boxes, so on a phone — where the cards are all there is — nothing could be compared. The
 * bar is drawn once, here, not once per layout: both the table and the cards are in the DOM and
 * the breakpoint hides one, so two bars would be two regions with the same name.
 */
function useCardSelection(
  materials: MaterialListItem[],
  selection: CrossPageSelection | undefined,
): { cards: CardSelection; bar: ReactNode } | null {
  return useMemo(() => {
    if (!selection) return null;
    const picked = new Set(selection.ids);
    const onPage = materials.filter((m) => picked.has(m.id)).length;
    return {
      cards: {
        isSelected: (id) => picked.has(id),
        onToggle: (id) =>
          selection.onChange(
            picked.has(id) ? selection.ids.filter((x) => x !== id) : [...selection.ids, id],
          ),
        label: ptBR.catalog.selectRow,
      },
      bar:
        selection.ids.length > 0 ? (
          <SelectionBar
            ids={selection.ids}
            acrossPages={selection.ids.length > onPage}
            onClear={() => selection.onChange([])}
          />
        ) : null,
    };
  }, [materials, selection]);
}

/** The "Galeria" view: a grid of cards at every width, with the same boxes and bar as the list. */
export function MaterialGallery({
  materials,
  searchQuery,
  valueLabel,
  selection,
}: {
  materials: MaterialListItem[];
  searchQuery?: string;
  valueLabel?: string;
  selection?: CrossPageSelection;
}) {
  const cardSelection = useCardSelection(materials, selection);
  return (
    <>
      {cardSelection?.bar}
      <MaterialCards
        materials={materials}
        searchQuery={searchQuery}
        layout="gallery"
        valueLabel={valueLabel}
        selection={cardSelection?.cards}
      />
    </>
  );
}

/**
 * A list of materials — stacked cards on a phone, the table from `sm` up.
 * Both render; the breakpoint picks one (D-50). D-217: the list is a page
 * (at most a few dozen rows), so rendering both costs little.
 */
export function MaterialList({
  materials,
  searchQuery,
  onPreview,
  previewId,
  compact,
  serverSort,
  columns,
  valueColumn,
  selection,
}: {
  materials: MaterialListItem[];
  /** D-232: a selection the page owns, so it crosses pages. */
  selection?: CrossPageSelection;
  searchQuery?: string;
  onPreview?: PreviewRequest;
  previewId?: number;
  compact?: boolean;
  serverSort?: ServerSort;
  columns?: ReadonlySet<CatalogColumn>;
  valueColumn?: string;
}) {
  const cardSelection = useCardSelection(materials, selection);
  return (
    <>
      {cardSelection?.bar}
      <MaterialCards
        materials={materials}
        searchQuery={searchQuery}
        valueLabel={valueColumn}
        selection={cardSelection?.cards}
      />
      <div className="hidden sm:block">
        <MaterialTable
          materials={materials}
          searchQuery={searchQuery}
          onPreview={onPreview}
          previewId={previewId}
          compact={compact}
          serverSort={serverSort}
          columns={columns}
          valueColumn={valueColumn}
          selection={selection}
          hideBar={Boolean(selection)}
        />
      </div>
    </>
  );
}
