"use client";

import type { SavedChartListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { MenuButton, MenuItem, ToggleChip } from "@/components/ui";
import { useAnnounce } from "@/components/ui/Announcer";
import { pinMap, unpinMap, usePinnedMaps } from "@/lib/pinnedMaps";

const t = ptBR.map;

/**
 * D-221: the saved maps as views — a row of chips above the figure (Notion's
 * view tabs), one click to reopen, and a "⋯" per view to pin it to the Início.
 * It replaces the "Mapas salvos" select that sat at the end of the axes panel,
 * where a saved map was a form value to pick rather than a place to go back to.
 * No saved map, no row: an empty strip would be one more thing to read.
 */
export function MapViews({
  charts,
  activeId,
  onOpen,
}: {
  charts: SavedChartListItem[] | undefined;
  activeId: number | null;
  onOpen: (id: number) => void;
}) {
  const pinned = usePinnedMaps();
  const announce = useAnnounce();
  if (!charts || charts.length === 0) return null;
  const pinnedIds = new Set(pinned.map((p) => p.id));
  return (
    <div role="group" aria-label={t.viewsLabel} className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-caption font-medium text-ink-muted">{t.viewsLabel}</span>
      {charts.map((chart) => {
        const isPinned = pinnedIds.has(chart.id);
        return (
          <span key={chart.id} className="inline-flex items-center">
            <ToggleChip
              selected={activeId === chart.id}
              title={t.viewOpen(chart.name)}
              onClick={() => onOpen(chart.id)}
            >
              {chart.name}
            </ToggleChip>
            <MenuButton label={t.viewMenu(chart.name)} iconOnly icon={<span aria-hidden>⋯</span>}>
              {isPinned ? (
                <MenuItem
                  onSelect={() => {
                    unpinMap(chart.id);
                    announce(t.unpinned(chart.name));
                  }}
                >
                  {t.unpinHome}
                </MenuItem>
              ) : (
                <MenuItem
                  onSelect={() => {
                    pinMap({ id: chart.id, name: chart.name });
                    announce(t.pinned(chart.name));
                  }}
                >
                  {t.pinHome}
                </MenuItem>
              )}
            </MenuButton>
          </span>
        );
      })}
    </div>
  );
}
