"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ORIGIN_ATTRIBUTE, markContainerOrigin } from "@/lib/containerTransition";
import type { DataQualitySummary, MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { classVisual } from "@/lib/design/palette";
import { MAX_COMPARE_MATERIALS, MIN_COMPARE_MATERIALS } from "@/lib/compareLimits";
import { encodeIdList } from "@/lib/idList";
import { listForSelection, selectionHrefForMaterials } from "@/lib/selectionList";
import { ariaSort, nextSort, sortRows, type SortState } from "@/lib/tableSort";
import { formatNumber } from "@/lib/format";
import {
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  ClassBadge,
  DataQualityBadge,
  RowHeader,
  SortTh,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
  type QualityState,
} from "@/components/ui";
import { DesignationCodes } from "./DesignationCodes";
import { HighlightText } from "./HighlightText";

const t = ptBR.catalog;

/** The three qualities, in the order the legend lists them, plus absence. */
const PARTS: { state: QualityState; of: (q: DataQualitySummary) => number }[] = [
  { state: "MEDIDO", of: (q) => q.medido },
  { state: "IMPORTADO", of: (q) => q.importado },
  { state: "ESTIMADO", of: (q) => q.estimado },
  { state: "AUSENTE", of: (q) => q.missing },
];

/**
 * What a material's data is made of, in one line.
 *
 * The catalogue used to say only that a material existed. Whether its numbers
 * were measured, imported, guessed or simply absent was a click away on the
 * sheet — which is where a reader finds out too late that the shortlist they
 * just built rests on estimates. Absence is one of the counts, never a blank.
 */
export function QualityBar({
  quality,
  referenceCount,
}: {
  quality: DataQualitySummary;
  referenceCount?: number;
}) {
  const present = PARTS.filter((p) => p.of(quality) > 0);
  if (present.length === 0) {
    return <span className="text-2xs italic text-ink-subtle">{t.noValues}</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-1" aria-label={t.qualityBreakdown}>
        {present.map((p) => (
          <DataQualityBadge
            key={p.state}
            state={p.state}
            className="tabular-nums"
            showLabel={false}
          />
        ))}
        <span className="ml-0.5 text-2xs text-ink-subtle">
          {present.map((p) => `${p.of(quality)} ${ptBR.quality[p.state].toLowerCase()}`).join(" · ")}
        </span>
      </span>
      {typeof referenceCount === "number" && (
        <span className="text-2xs text-ink-muted">
          {referenceCount > 0 ? t.referenceCount(referenceCount) : t.noReferences}
        </span>
      )}
    </div>
  );
}

/**
 * Asked on a plain click of a material's name (D-184). It answers whether the
 * catalogue showed the material beside the list; when it did not (a narrow
 * screen), the link navigates to the full sheet as before. Ctrl/Cmd, Shift and
 * the middle button always keep the browser's own behaviour.
 */
export type PreviewRequest = (id: number) => boolean;

function MaterialName({
  material,
  searchQuery,
  onPreview,
  previewed,
}: {
  material: MaterialListItem;
  searchQuery?: string;
  onPreview?: PreviewRequest;
  previewed?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link
        href={`/app/materiais/${material.id}`}
        aria-current={previewed ? "true" : undefined}
        onClick={(event) => {
          const plain =
            event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
          if (plain && onPreview?.(material.id)) {
            event.preventDefault();
            return;
          }
          markContainerOrigin(event);
        }}
        className="font-medium text-brand hover:underline"
      >
        <HighlightText text={material.name} query={searchQuery} />
      </Link>
    </span>
  );
}

type SortKey = "name" | "class";

/** D-217: the columns a reader may hide; the material's name always stays. */
export type CatalogColumn = "class" | "quality" | "keywords" | "designations";
export const CATALOG_COLUMNS: readonly CatalogColumn[] = [
  "class",
  "quality",
  "keywords",
  "designations",
];

/**
 * D-217: the order lives with the server when the list is a page — sorting the
 * fifty rows on screen would say nothing about the other six hundred. The
 * screen passes the order it asked for and hears the header clicks back.
 */
export interface ServerSort {
  state: SortState<SortKey> | null;
  onChange: (next: SortState<SortKey> | null) => void;
}

/**
 * The value the catalogue was ordered by, in the reader's unit. Absence is a
 * word, never a blank or a zero (D-24).
 */
export function SortValueCell({ material }: { material: MaterialListItem }) {
  const sv = material.sort_value;
  if (!sv || sv.value === null) {
    return (
      <span className="text-2xs italic text-ink-subtle">
        {sv?.is_missing ? t.valueAbsent : t.valueNotRegistered}
      </span>
    );
  }
  return (
    <span className="tabular-nums text-ink">
      {formatNumber(sv.value)}
      {sv.unit ? <span className="ml-1 text-caption text-ink-muted">{sv.unit}</span> : null}
    </span>
  );
}

/**
 * D-232: a selection the page owns, so it can cross pages (and survive a filter
 * or a reload when the page keeps it in the address). Absent, the table keeps
 * its own, which never outlives the rows it shows.
 */
export interface CrossPageSelection {
  ids: readonly number[];
  onChange: (ids: number[]) => void;
}

/**
 * The catalogue as a table (D-131, after the M3 data-table pattern).
 *
 * - **Sort** by material or class — labels only. Quality and keywords are not
 *   sortable, and no measured value is on this table to sort (ranking is the
 *   backend's, principle 2). The first state is the order the search returned.
 * - **Select** rows to act on several at once. "Selecionar todos" means every
 *   row *listed*, not every material in the catalogue; a selection never
 *   outlives its row (filtering a material out of the list drops it from the
 *   count), so the bar never acts on something the reader cannot see.
 *   With `selection` (D-232) the page owns it and it does cross pages: the bar
 *   then says "N selecionados em várias páginas" and offers "Limpar seleção".
 * - The action bar replaces nothing and moves nothing: it appears above the
 *   table, as a labelled region, and says in words why "Comparar" is off.
 */
export function MaterialTable({
  materials,
  searchQuery,
  onPreview,
  previewId,
  compact = false,
  serverSort,
  columns,
  valueColumn,
  selection,
}: {
  materials: MaterialListItem[];
  searchQuery?: string;
  /** D-232: the selection, owned by the page so it crosses pages; absent, the table keeps its own. */
  selection?: CrossPageSelection;
  /** D-184: open the material beside the list instead of leaving it. */
  onPreview?: PreviewRequest;
  /** The material shown in the detail pane, marked in its row. */
  previewId?: number;
  /** Beside the detail pane: designations and keywords stay on the sheet. */
  compact?: boolean;
  /** D-217: the order is the server's (a paged list); absent, the rows sort here. */
  serverSort?: ServerSort;
  /** D-217: the optional columns shown; all of them when absent. */
  columns?: ReadonlySet<CatalogColumn>;
  /** D-217: the property the list is ordered by, shown as its own column. */
  valueColumn?: string;
}) {
  const [localSort, setLocalSort] = useState<SortState<SortKey> | null>(null);
  const sort = serverSort ? serverSort.state : localSort;
  const setSort = serverSort ? serverSort.onChange : setLocalSort;
  const show = (column: CatalogColumn) => !columns || columns.has(column);
  const [localPicked, setLocalPicked] = useState<ReadonlySet<number>>(new Set());
  const allRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    if (!sort || serverSort) return materials;
    return sortRows(
      materials,
      (m) => (sort.key === "name" ? m.name : m.class_name),
      sort.dir,
    );
  }, [materials, sort, serverSort]);

  // The selection, as ids: the page's when it owns it (it may name materials on
  // other pages), otherwise the table's own, limited to the rows it still shows.
  const picked = useMemo<ReadonlySet<number>>(
    () => (selection ? new Set(selection.ids) : localPicked),
    [selection, localPicked],
  );
  const selectedIds = useMemo(
    () =>
      selection
        ? [...selection.ids]
        : materials.filter((m) => localPicked.has(m.id)).map((m) => m.id),
    [selection, materials, localPicked],
  );
  const onPage = materials.filter((m) => picked.has(m.id)).length;
  const allSelected = materials.length > 0 && onPage === materials.length;
  const someSelected = onPage > 0 && !allSelected;
  const acrossPages = selectedIds.length > onPage;

  function setPicked(next: ReadonlySet<number>) {
    if (selection) selection.onChange([...next]);
    else setLocalPicked(next);
  }

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggle(id: number, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  }

  /** "Selecionar todos" adds the page's rows to the selection, never replaces what other pages hold. */
  function togglePage(on: boolean) {
    const next = new Set(picked);
    for (const m of materials) {
      if (on) next.add(m.id);
      else next.delete(m.id);
    }
    setPicked(next);
  }

  const compareHref = `/app/comparar?materiais=${encodeIdList(selectedIds)}`;
  const tooFew = selectedIds.length < MIN_COMPARE_MATERIALS;
  const tooMany = selectedIds.length > MAX_COMPARE_MATERIALS;
  // D-232: the selection also goes to the Selection, as a list of materials.
  const listCapped = listForSelection(selectedIds).truncated;

  return (
    <div className="flex flex-col gap-2">
      {selectedIds.length > 0 ? (
        // D-184: the M3 floating toolbar. Pinned above the bottom bar on a
        // phone (`--bottom-nav-offset`, D-91), centred, on inverse-surface, so
        // it stays in reach while the reader scrolls the rows they are marking.
        <div
          role="region"
          aria-label={t.selectionBar}
          className="m3-floating-toolbar"
        >
          <span role="status" className="m3-floating-toolbar-count">
            {acrossPages ? t.selectedAcrossPages(selectedIds.length) : t.selectedCount(selectedIds.length)}
          </span>
          {tooFew || tooMany ? (
            <>
              <Button size="sm" variant="tonal" disabled>
                {t.compareSelected}
              </Button>
              <span className="m3-floating-toolbar-note">
                {tooMany ? t.compareTooMany(MAX_COMPARE_MATERIALS) : t.compareNeedsTwo}
              </span>
            </>
          ) : (
            <ButtonLink size="sm" variant="tonal" href={compareHref}>
              {t.compareSelected}
            </ButtonLink>
          )}
          <ButtonLink size="sm" variant="tonal" href={selectionHrefForMaterials(selectedIds)}>
            {t.openInSelection}
          </ButtonLink>
          {listCapped ? (
            <span className="m3-floating-toolbar-note">
              {t.openInSelectionCapped(listForSelection(selectedIds).ids.length)}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="m3-floating-toolbar-ghost"
            onClick={() => setPicked(new Set())}
          >
            {t.clearSelection}
          </Button>
        </div>
      ) : null}
      <TableScroll label={t.title}>
        <Table>
          <TableCaption>{t.title}</TableCaption>
          <THead>
            <Tr>
              <Th className="w-10">
                {/* The name is an aria-label, not hidden text: a visually hidden
                    "Selecionar <material>" would also be page text, and anything that
                    looks the material up by its name (a search, the E2E) would find it twice. */}
                <Checkbox
                  ref={allRef}
                  aria-label={t.selectAll}
                  label=""
                  checked={allSelected}
                  onChange={(e) => togglePage(e.target.checked)}
                />
              </Th>
              <SortTh
                label={t.columnName}
                sort={ariaSort(sort, "name")}
                onSort={() => setSort(nextSort(sort, "name"))}
              />
              {valueColumn ? <Th>{t.columnValue(valueColumn)}</Th> : null}
              {compact || !show("class") ? null : (
                <SortTh
                  label={t.columnClass}
                  sort={ariaSort(sort, "class")}
                  onSort={() => setSort(nextSort(sort, "class"))}
                />
              )}
              {show("quality") ? <Th>{t.columnQuality}</Th> : null}
              {compact || !show("keywords") ? null : <Th>{t.columnKeywords}</Th>}
            </Tr>
          </THead>
          <TBody>
            {rows.map((m) => (
              <Tr
                key={m.id}
                className={picked.has(m.id) || previewId === m.id ? "bg-brand-50" : undefined}
                {...{ [ORIGIN_ATTRIBUTE]: "" }}
              >
                <Td>
                  <Checkbox
                    aria-label={t.selectRow(m.name)}
                    label=""
                    checked={picked.has(m.id)}
                    onChange={(e) => toggle(m.id, e.target.checked)}
                  />
                </Td>
                <RowHeader>
                  <MaterialName
                    material={m}
                    searchQuery={searchQuery}
                    onPreview={onPreview}
                    previewed={previewId === m.id}
                  />
                  {m.subclass && (
                    <span className="block text-caption text-ink-subtle">
                      <HighlightText text={m.subclass} query={searchQuery} />
                    </span>
                  )}
                  {compact ? (
                    <span className="mt-1 block">
                      <ClassBadge name={m.class_name} color={classVisual(m.class_slug).color} />
                    </span>
                  ) : show("designations") ? (
                    <DesignationCodes designations={m.designations} searchQuery={searchQuery} />
                  ) : null}
                </RowHeader>
                {valueColumn ? (
                  <Td>
                    <SortValueCell material={m} />
                  </Td>
                ) : null}
                {compact || !show("class") ? null : (
                  <Td>
                    <ClassBadge name={m.class_name} color={classVisual(m.class_slug).color} />
                  </Td>
                )}
                {show("quality") ? (
                  <Td>
                    {/* Beside the sheet the reference count is on the sheet itself. */}
                    <QualityBar
                      quality={m.quality}
                      referenceCount={compact ? undefined : m.reference_count}
                    />
                  </Td>
                ) : null}
                {compact || !show("keywords") ? null : (
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {m.keywords.map((kw, i) => (
                        // Text plus position: a record may repeat a keyword (D-202).
                        <Badge key={`${kw}:${i}`}>
                          <HighlightText text={kw} query={searchQuery} />
                        </Badge>
                      ))}
                    </span>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableScroll>
    </div>
  );
}
