"use client";

import { ptBR } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui";
import { IconCompare, IconScatter } from "@/components/ui/icons";
import { FavoriteButton } from "@/components/my-records/FavoriteButton";
import { MaterialExportMenu } from "@/components/CaeExportDialog";
import type { ComponentProps } from "react";

const t = ptBR.detail;

/**
 * The sheet's actions on a phone (D-197; m3.material.io › Components ›
 * Toolbars, floating). Under 600 px the header's actions scroll away with the
 * long sheet; here they float above the bottom nav, within the thumb's reach.
 * The same actions the header has — favourite, export — plus the two doors the
 * sheet already opens (compare it, see it on the map). Nothing new happens here,
 * and the header's copies are hidden on a phone so no action is read twice.
 */
export function SheetActions({
  materialId,
  unitChoices,
  showMap,
}: {
  materialId: number;
  unitChoices: ComponentProps<typeof MaterialExportMenu>["unitChoices"];
  /** Only when the sheet itself offers the map (it has the chart's two properties). */
  showMap: boolean;
}) {
  return (
    <div role="toolbar" aria-label={t.sheetActions} className="m3-floating-toolbar m3-floating-toolbar-standard m3-sheet-actions">
      <FavoriteButton universe="material" recordId={materialId} />
      {/* Icons with their names kept for screen readers: four labelled
          buttons do not fit one row at 375 px. */}
      <ButtonLink
        href={`/app/comparar?materiais=${materialId}`}
        size="sm"
        variant="tonal"
        title={t.compareThis}
        icon={<IconCompare className="h-4 w-4" />}
        className="m3-toolbar-icon"
      >
        <span className="sr-only">{t.compareThis}</span>
      </ButtonLink>
      {showMap ? (
        <ButtonLink
          href={`/app/mapas?x=densidade&y=modulo_young&destaque=${materialId}`}
          size="sm"
          variant="tonal"
          title={t.seeOnMap}
          icon={<IconScatter className="h-4 w-4" />}
          className="m3-toolbar-icon"
        >
          <span className="sr-only">{t.seeOnMap}</span>
        </ButtonLink>
      ) : null}
      <MaterialExportMenu materialId={materialId} unitChoices={unitChoices} />
    </div>
  );
}
