"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listCatalogReleases } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { Section } from "@/components/ui";

const t = ptBR.home;

/**
 * "Novidades do catálogo" (D-222): the latest imported release, from the table
 * of releases that already exists (D-108). The demo seed never counts as news,
 * a release the importer never ran on has no date to print, and when there is
 * nothing to say — or the list does not load — the block is not drawn: it is
 * an extra, not something the page needs.
 */
export function CatalogNews() {
  const releases = useQuery({ queryKey: ["catalog-releases"], queryFn: listCatalogReleases });
  const latest = [...(releases.data ?? [])]
    .filter((r) => !r.is_demo && r.imported_at)
    .sort((a, b) => (b.imported_at ?? "").localeCompare(a.imported_at ?? ""))[0];
  if (!latest) return null;
  const when = latest.imported_at ? formatDate(latest.imported_at) : null;

  return (
    <Section title={t.newsTitle} description={t.newsHint}>
      <div className="msds-card flex min-w-0 flex-col gap-1 p-4">
        <p className="break-words text-body font-medium text-ink">{t.newsRelease(latest.name, latest.release)}</p>
        <p className="text-support text-ink-muted">
          {t.newsCount(latest.material_count)}
          {when ? `. ${t.newsWhen(when)}` : "."}
        </p>
        <Link href="/app/catalogo/releases" className="self-start text-caption text-accent underline">
          {t.newsOpen}
        </Link>
      </div>
    </Section>
  );
}
