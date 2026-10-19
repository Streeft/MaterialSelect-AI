"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ORIGIN_ATTRIBUTE, markContainerOrigin } from "@/lib/containerTransition";
import type { DataQualitySummary, MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { classVisual } from "@/lib/design/palette";
import { MAX_COMPARE_MATERIALS, MIN_COMPARE_MATERIALS } from "@/lib/compareLimits";
import { ariaSort, nextSort, sortRows, type SortState } from "@/lib/tableSort";
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

function MaterialName({
  material,
  searchQuery,
}: {
  material: MaterialListItem;
  searchQuery?: string;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link
        href={`/app/materiais/${material.id}`}
        onClick={markContainerOrigin}
        className="font-medium text-brand hover:underline"
      >
        <HighlightText text={material.name} query={searchQuery} />
      </Link>
    </span>
  );
}

type SortKey = "name" | "class";

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
 * - The action bar replaces nothing and moves nothing: it appears above the
 *   table, as a labelled region, and says in words why "Comparar" is off.
 */
export function MaterialTable({
  materials,
  searchQuery,
}: {
  materials: MaterialListItem[];
  searchQuery?: string;
}) {
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const allRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    if (!sort) return materials;
    return sortRows(
      materials,
      (m) => (sort.key === "name" ? m.name : m.class_name),
      sort.dir,
    );
  }, [materials, sort]);

  const selected = useMemo(() => materials.filter((m) => picked.has(m.id)), [materials, picked]);
  const allSelected = materials.length > 0 && selected.length === materials.length;
  const someSelected = selected.length > 0 && !allSelected;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggle(id: number, on: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const compareHref = `/app/comparar?materiais=${selected.map((m) => m.id).join(",")}`;
  const tooFew = selected.length < MIN_COMPARE_MATERIALS;
  const tooMany = selected.length > MAX_COMPARE_MATERIALS;

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 ? (
        <div
          role="region"
          aria-label={t.selectionBar}
          className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-well px-4 py-2"
        >
          <span role="status" className="text-sm font-medium text-ink">
            {t.selectedCount(selected.length)}
          </span>
          {tooFew || tooMany ? (
            <>
              <Button size="sm" variant="secondary" disabled>
                {t.compareSelected}
              </Button>
              <span className="text-support text-ink-muted">
                {tooMany ? t.compareTooMany(MAX_COMPARE_MATERIALS) : t.compareNeedsTwo}
              </span>
            </>
          ) : (
            <ButtonLink size="sm" variant="secondary" href={compareHref}>
              {t.compareSelected}
            </ButtonLink>
          )}
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
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
                  onChange={(e) =>
                    setPicked(e.target.checked ? new Set(materials.map((m) => m.id)) : new Set())
                  }
                />
              </Th>
              <SortTh
                label={t.columnName}
                sort={ariaSort(sort, "name")}
                onSort={() => setSort(nextSort(sort, "name"))}
              />
              <SortTh
                label={t.columnClass}
                sort={ariaSort(sort, "class")}
                onSort={() => setSort(nextSort(sort, "class"))}
              />
              <Th>{t.columnQuality}</Th>
              <Th>{t.columnKeywords}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((m) => (
              <Tr
                key={m.id}
                className={picked.has(m.id) ? "bg-brand-50" : undefined}
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
                  <MaterialName material={m} searchQuery={searchQuery} />
                  {m.subclass && (
                    <span className="block text-xs text-ink-subtle">
                      <HighlightText text={m.subclass} query={searchQuery} />
                    </span>
                  )}
                  <DesignationCodes designations={m.designations} searchQuery={searchQuery} />
                </RowHeader>
                <Td>
                  <ClassBadge name={m.class_name} color={classVisual(m.class_slug).color} />
                </Td>
                <Td>
                  <QualityBar quality={m.quality} referenceCount={m.reference_count} />
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {m.keywords.map((kw) => (
                      <Badge key={kw}>
                        <HighlightText text={kw} query={searchQuery} />
                      </Badge>
                    ))}
                  </span>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableScroll>
    </div>
  );
}
