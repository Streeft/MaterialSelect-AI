"use client";

import { useQuery } from "@tanstack/react-query";
import { getMaterial } from "@/lib/api";
import { markContainerOrigin, ORIGIN_ATTRIBUTE } from "@/lib/containerTransition";
import { ptBR } from "@/lib/i18n";
import { classVisual } from "@/lib/design/palette";
import type { MaterialListItem } from "@/lib/types";
import { PropertyGroupCard } from "@/components/PropertyGroup";
import { ButtonLink, ClassBadge, ErrorState, IconButton, LoadingIndicator } from "@/components/ui";
import { IconClose } from "@/components/ui/icons";
import { DesignationCodes } from "./DesignationCodes";
import { QualityBar } from "./MaterialRows";

const t = ptBR.catalog.preview;

/**
 * The detail pane of the catalogue's list-detail layout (D-185): the sheet of
 * the material picked in the list, beside it, so the reader compares without
 * losing their place. The values are the sheet's own (`PropertyGroupCard`:
 * quality badge, provenance popover, absence written out) — nothing is
 * summarised or recomputed here. The full page stays one link away.
 *
 * Same query key as the full sheet with no unit choice, so opening the page
 * afterwards reuses what was just read.
 */
export function MaterialPreview({
  item,
  onClose,
}: {
  item: MaterialListItem;
  onClose: () => void;
}) {
  const material = useQuery({
    queryKey: ["material", item.id, null],
    queryFn: () => getMaterial(item.id),
  });
  const href = `/app/materiais/${item.id}`;

  // The pane itself is the origin: "Abrir ficha completa" grows the sheet out of it (D-148, D-185).
  return (
    <div className="flex flex-col gap-4" {...{ [ORIGIN_ATTRIBUTE]: "" }}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <ClassBadge name={item.class_name} color={classVisual(item.class_slug).color} />
            {item.subclass ? <span className="text-support text-ink-muted">{item.subclass}</span> : null}
          </span>
          <h2 className="text-title font-semibold text-ink">{item.name}</h2>
          <DesignationCodes designations={item.designations} />
          <QualityBar quality={item.quality} referenceCount={item.reference_count} />
        </div>
        <IconButton label={t.close} onClick={onClose} icon={<IconClose className="h-4 w-4" />} />
      </div>
      <div>
        <ButtonLink href={href} variant="tonal" size="sm" onClick={markContainerOrigin}>
          {t.openFull}
        </ButtonLink>
      </div>

      {material.isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingIndicator label={t.loading} />
        </div>
      ) : material.isError ? (
        <ErrorState title={t.error} onRetry={() => void material.refetch()} />
      ) : material.data ? (
        material.data.property_groups.length === 0 ? (
          <p className="text-support text-ink-muted">{t.noProperties}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {material.data.description ? (
              <p className="max-w-prose text-support text-ink-muted">{material.data.description}</p>
            ) : null}
            {material.data.property_groups.map((group) => (
              <PropertyGroupCard key={group.category} group={group} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
