"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Bookmark, MaterialListItem } from "@/lib/types";
import { getMyRecords } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { classVisual } from "@/lib/design/palette";
import { MY_RECORDS_KEY } from "@/components/my-records/FavoriteButton";
import { MaterialCards } from "@/components/catalog/MaterialCards";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/ui";

const t = ptBR.myRecords;

/**
 * Where a bookmarked record lives, in either universe.
 *
 * One function rather than a ternary at each call site, so that adding a third
 * universe is one edit and cannot half-happen.
 */
function bookmarkHref(bookmark: Bookmark): string | null {
  if (bookmark.universe === "material" && bookmark.material) {
    return `/app/materiais/${bookmark.material.id}`;
  }
  if (bookmark.universe === "process" && bookmark.process) {
    return `/app/processos/${bookmark.process.slug}`;
  }
  return null;
}

function bookmarkName(bookmark: Bookmark): string | null {
  return bookmark.material?.name ?? bookmark.process?.name ?? null;
}

function bookmarkClass(bookmark: Bookmark): { name: string; slug: string } | null {
  const record = bookmark.material ?? bookmark.process;
  return record ? { name: record.class_name, slug: record.class_slug } : null;
}

/**
 * One bookmarked record as a row.
 *
 * A record that no longer resolves is not rendered at all — the API already
 * drops those, and this guard is the second half of the same decision: an id
 * on screen would be worse than an absence, because it names nothing a reader
 * can act on.
 */
function BookmarkRow({ bookmark, index }: { bookmark: Bookmark; index: number }) {
  const href = bookmarkHref(bookmark);
  const name = bookmarkName(bookmark);
  const klass = bookmarkClass(bookmark);
  if (!href || !name) return null;

  const isOwn = bookmark.material?.is_own_record ?? false;

  return (
    <Card riseIndex={index}>
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Link href={href} className="text-[0.9375rem] font-semibold text-brand-700">
            {name}
          </Link>
          <Badge tone="neutral">
            {bookmark.universe === "material" ? t.universeMaterial : t.universeProcess}
          </Badge>
          {isOwn && <Badge tone="info">{t.ownBadge}</Badge>}
        </span>
        {klass ? (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-seat bg-surface-sunken px-2 py-1 text-2xs text-ink-muted"
            title={klass.name}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-sm"
              style={{ background: classVisual(klass.slug).color }}
            />
            {klass.name}
          </span>
        ) : null}
      </CardBody>
    </Card>
  );
}

function BookmarkList({
  bookmarks,
  emptyTitle,
  emptyHint,
}: {
  bookmarks: Bookmark[];
  emptyTitle: string;
  emptyHint: string;
}) {
  // Absence is written out, never an empty panel (D-24): a blank area reads as
  // "this failed to load", which is a different thing from "you have not
  // starred anything yet".
  if (bookmarks.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyHint} />;
  }
  return (
    <div className="flex flex-col gap-2">
      {bookmarks.map((bookmark, index) => (
        <BookmarkRow
          key={`${bookmark.universe}-${bookmark.material?.id ?? bookmark.process?.id}`}
          bookmark={bookmark}
          index={index}
        />
      ))}
    </div>
  );
}

function OwnRecords({ records }: { records: MaterialListItem[] }) {
  if (records.length === 0) {
    return <EmptyState title={t.ownRecordsEmpty} description={t.ownRecordsHint} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {/* The same claim the exported document makes, and for the same reason:
          these values never went through the catalogue's source-and-licence
          review, and the one place that must not be quiet about it is the
          screen that presents them as a collection. */}
      <Alert tone="info">{t.ownNotice}</Alert>
      <MaterialCards materials={records} />
    </div>
  );
}

/**
 * The user's own space (P1-4).
 *
 * Three sections, one request: favourites, recents and own records arrive
 * together because they are rendered together, and three calls would let one
 * list describe a catalogue the others never saw.
 */
export default function MyRecordsPage() {
  const query = useQuery({ queryKey: MY_RECORDS_KEY, queryFn: getMyRecords });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState description={(query.error as Error).message} />}

      {query.data && (
        <>
          <Section title={t.favorites} description={t.favoritesHint}>
            <BookmarkList
              bookmarks={query.data.favorites}
              emptyTitle={t.favoritesEmpty}
              emptyHint={t.favoritesHint}
            />
          </Section>

          <Section title={t.recents} description={t.recentsHint}>
            <BookmarkList
              bookmarks={query.data.recents}
              emptyTitle={t.recentsEmpty}
              emptyHint={t.recentsHint}
            />
          </Section>

          <Section title={t.ownRecords} description={t.ownRecordsHint}>
            <OwnRecords records={query.data.own_records} />
          </Section>
        </>
      )}
    </div>
  );
}
