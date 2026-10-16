"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getMyRecords } from "@/lib/api";
import { classVisual } from "@/lib/design/palette";
import { ptBR } from "@/lib/i18n";
import { MY_RECORDS_KEY } from "@/components/my-records/FavoriteButton";
import { bookmarkClass, bookmarkHref, bookmarkName } from "@/components/my-records/bookmark";
import { Badge, ClassBadge, EmptyState, ErrorState, ListSkeleton, Section } from "@/components/ui";

const t = ptBR.home;

/** The Drive shelf holds a handful, not a history; the full list is "Meus registros". */
const SHOWN = 6;

/**
 * "Vistos recentemente" — the records the reader opened last (D-132).
 *
 * It reads the same `/my-records` payload (and query key) as the page of that
 * name, so opening a material and coming back finds it here without a second
 * request. A record that no longer resolves has no link and no name, and is
 * skipped: an id on screen would name nothing the reader can act on.
 */
export function RecentRecords() {
  const records = useQuery({ queryKey: MY_RECORDS_KEY, queryFn: getMyRecords });

  const items = (records.data?.recents ?? []).filter(
    (b) => bookmarkHref(b) !== null && bookmarkName(b) !== null,
  );

  return (
    <Section title={t.recentTitle} description={t.recentHint}>
      {records.isPending && <ListSkeleton variant="cards" count={3} />}

      {records.isError && (
        <ErrorState description={t.recentError} onRetry={() => records.refetch()} />
      )}

      {records.data && items.length === 0 && (
        <EmptyState title={t.recentEmpty} description={t.recentEmptyHint} />
      )}

      {items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, SHOWN).map((b) => {
            const klass = bookmarkClass(b);
            return (
              <li key={`${b.universe}-${bookmarkHref(b)}`}>
                <Link
                  href={bookmarkHref(b)!}
                  className="flex h-full flex-col gap-2 rounded-card border border-line bg-panel p-4 shadow-card transition hover:border-brand hover:bg-brand-50"
                >
                  <span className="text-sm font-medium text-ink">{bookmarkName(b)}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {klass ? (
                      <ClassBadge name={klass.name} color={classVisual(klass.slug).color} />
                    ) : null}
                    <Badge tone="neutral">
                      {b.universe === "material"
                        ? ptBR.myRecords.universeMaterial
                        : ptBR.myRecords.universeProcess}
                    </Badge>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
