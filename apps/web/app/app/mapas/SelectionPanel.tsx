"use client";

import type { BoxSelection } from "@/components/charts/AshbyMap";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { encodeIdList } from "@/lib/idList";
import { Alert, Button, ButtonLink } from "@/components/ui";

const t = ptBR.map;

function bound(value: number | null): string {
  return value !== null ? formatNumber(value) : "—";
}

/**
 * The side panel of what is selected on the map (D-213): a box, a lasso or
 * rows marked in the point list all land here as one set of records, and the
 * set becomes a filter or a hand-off — "Comparar" (the comparator takes the
 * ids), "Abrir na Seleção" (a box becomes a Chart Stage, D-60/D-81: the
 * backend converts it to canonical units) or "Mostrar só estes no mapa" (the
 * map is restricted to them, through the same `?materiais=` a study uses).
 * The selection itself lives in the address, so a reload keeps it.
 */
export function SelectionPanel({
  universe,
  selectedIds,
  plottedIds,
  box,
  xUnit,
  yUnit,
  handingOff,
  handoffError,
  onOpenInSelection,
  onRestrict,
  onClear,
}: {
  universe: "material" | "process";
  selectedIds: number[];
  plottedIds: ReadonlySet<number>;
  box: BoxSelection | null;
  xUnit: string;
  yUnit: string;
  handingOff: boolean;
  handoffError: string | null;
  onOpenInSelection: () => void;
  onRestrict: () => void;
  onClear: () => void;
}) {
  const count = selectedIds.length;
  const outside = selectedIds.filter((id) => !plottedIds.has(id)).length;
  const hasSelection = count > 0 || box !== null;

  // D-220: the body of the inspector's "Seleção" section; the heading is the section's.
  if (!hasSelection) return <p className="text-support text-ink-muted">{t.selectionEmpty}</p>;
  return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1" role="status" aria-live="polite">
            <span className="text-caption font-semibold text-ink-muted">
              {box ? t.selectionKindBox : t.selectionKindPicked}
            </span>
            <span className="text-body font-medium text-ink">{t.selectionCount(count)}</span>
            {box ? (
              <span className="text-caption text-ink-muted">
                {t.selectedRegionBounds(
                  `${bound(box.xMin)} a ${bound(box.xMax)} ${prettyUnit(xUnit)}`,
                  `${bound(box.yMin)} a ${bound(box.yMax)} ${prettyUnit(yUnit)}`,
                )}
              </span>
            ) : null}
            {outside > 0 ? (
              <span className="text-caption text-ink-muted">{t.selectionOutside(outside)}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {universe === "material" && count > 0 ? (
              <ButtonLink
                size="sm"
                variant={box ? "secondary" : "primary"}
                href={`/app/comparar?materiais=${encodeIdList(selectedIds)}`}
              >
                {t.compareSelection} →
              </ButtonLink>
            ) : null}
            {box ? (
              <Button size="sm" variant="primary" loading={handingOff} onClick={onOpenInSelection}>
                {t.openInSelection} →
              </Button>
            ) : null}
            {count > 0 ? (
              <Button size="sm" variant="secondary" onClick={onRestrict}>
                {t.showOnlySelection}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onClear}>
              {t.clearSelection}
            </Button>
          </div>
          {!box ? <p className="text-support text-ink-muted">{t.openInSelectionNeedsBox}</p> : null}
          {handoffError ? <Alert tone="danger">{handoffError}</Alert> : null}
        </div>
  );
}
