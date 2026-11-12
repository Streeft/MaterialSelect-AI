"use client";

import Link from "next/link";
import { ptBR } from "@/lib/i18n";
import { Section } from "@/components/ui";
import { IconChartScatter } from "@/components/ui/icons";
import { usePinnedMaps } from "@/lib/pinnedMaps";

const t = ptBR.home;

/**
 * D-221: the saved maps a reader pinned in Mapas ("Fixar no Início"). Each is a
 * link that reopens the saved map (`?grafico=`): the configuration is fetched
 * again, never kept here. No pin, no block — the Início does not grow an empty
 * section for a feature the reader has not used.
 */
export function PinnedMaps() {
  const pinned = usePinnedMaps();
  if (pinned.length === 0) return null;
  return (
    <Section title={t.pinnedTitle} description={t.pinnedHint}>
      <ul className="flex flex-wrap gap-2">
        {pinned.map((map) => (
          <li key={map.id}>
            <Link
              href={`/app/mapas?grafico=${map.id}`}
              data-interactive="true"
              className="msds-card m3-state flex items-center gap-2 px-4 py-3 text-body font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconChartScatter aria-hidden className="h-4 w-4 text-ink-muted" />
              {map.name}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
