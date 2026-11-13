"use client";

import Link from "next/link";
import { ptBR } from "@/lib/i18n";
import { Section } from "@/components/ui";
import { LayoutBlocks } from "@/components/dashboard/OverviewBlocks";
import { CatalogNews } from "./CatalogNews";
import { FirstUseGuide } from "./FirstUseGuide";
import { PinnedMaps } from "./PinnedMaps";
import { RecentRecords } from "./RecentRecords";
import { ResumeWork } from "./ResumeWork";
import { SavedStudies } from "./SavedStudies";
import { TaskShortcuts } from "./TaskShortcuts";

const t = ptBR.home;
const names = t.blocks.names;

function Explore() {
  return (
    <Section title={t.exploreTitle}>
      <ul className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/app/catalogo", label: ptBR.nav.catalog, hint: t.catalogHint },
          { href: "/app/mapas", label: ptBR.nav.maps, hint: t.mapsHint },
          { href: "/app/comparar", label: ptBR.nav.compare, hint: t.compareHint },
        ].map((item) => (
          <li key={item.href}>
            <Link href={item.href} data-interactive="true" className="msds-card flex h-full flex-col gap-1 p-4">
              <span className="text-body font-medium text-ink">{item.label}</span>
              <span className="text-caption text-ink-muted">{item.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * D-232b (F6): everything under the composer is a block the reader moves and
 * hides — Notion's home, the dashboard's blocks (D-209). The arrangement is the
 * account's `inicio` layout row; a block with nothing to show (no draft to
 * resume, no pinned map) says so in one line instead of a large empty state. The composer stays first and fixed: it
 * is the page's one primary action (D-195), not a block among others.
 */
export function HomeBlocks() {
  return (
    <LayoutBlocks
      scope="inicio"
      label={t.blocks.label}
      hint={t.blocks.hint}
      resetLabel={t.blocks.reset}
      emptyLabel={t.blocks.empty}
      blocks={[
        { id: "guia", name: names.guia, node: <FirstUseGuide /> },
        { id: "retomar", name: names.retomar, node: <ResumeWork /> },
        { id: "recentes", name: names.recentes, node: <RecentRecords /> },
        { id: "estudos", name: names.estudos, node: <SavedStudies /> },
        { id: "atalhos", name: names.atalhos, node: <TaskShortcuts /> },
        { id: "novidades", name: names.novidades, node: <CatalogNews /> },
        { id: "mapas", name: names.mapas, node: <PinnedMaps /> },
        { id: "explorar", name: names.explorar, node: <Explore /> },
      ]}
    />
  );
}
