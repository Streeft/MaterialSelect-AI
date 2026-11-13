"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Bookmark, MaterialListItem, MyRecords } from "@/lib/types";
import { getMyRecords, removeFavorite } from "@/lib/api";
import { encodeIdList } from "@/lib/idList";
import {
  MY_RECORDS_URL,
  RECORD_KINDS,
  bookmarkKey,
  classOptions,
  filterBookmarks,
  filterOwn,
  type RecordKind,
} from "@/lib/myRecordsFilter";
import { useUrlState } from "@/lib/urlState";
import { useUndoableDelete } from "@/lib/useUndoableDelete";
import { ptBR } from "@/lib/i18n";
import { classVisual } from "@/lib/design/palette";
import { MY_RECORDS_KEY } from "@/components/my-records/FavoriteButton";
import {
  bookmarkClass,
  bookmarkHref,
  bookmarkName,
} from "@/components/my-records/bookmark";
import { MaterialCards } from "@/components/catalog/MaterialCards";
import { AISuggestPanel } from "@/components/ai/AISuggestPanel";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterBar,
  Input,
  ListSkeleton,
  PageHeader,
  Section,
  StepCard,
} from "@/components/ui";

const t = ptBR.myRecords;

/**
 * One bookmarked record as a row.
 *
 * A record that no longer resolves is not rendered at all — the API already
 * drops those, and this guard is the second half of the same decision: an id
 * on screen would be worse than an absence, because it names nothing a reader
 * can act on.
 */
function BookmarkRow({
  bookmark,
  index,
  selection,
}: {
  bookmark: Bookmark;
  index: number;
  /** Only favourites can be selected; recents are a history, not a collection. */
  selection?: { checked: boolean; onToggle: () => void };
}) {
  const href = bookmarkHref(bookmark);
  const name = bookmarkName(bookmark);
  const klass = bookmarkClass(bookmark);
  if (!href || !name) return null;

  const isOwn = bookmark.material?.is_own_record ?? false;

  return (
    // A row, not a card: the list already lives in a card (D-80).
    <div
      className="rise flex flex-wrap items-center justify-between gap-3 rounded-control border border-edge px-3 py-2.5"
      style={index < 6 ? { animationDelay: `${index * 40}ms` } : undefined}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2 break-words">
        {selection ? (
          <Checkbox
            label={<span className="sr-only">{t.selectRow(name)}</span>}
            checked={selection.checked}
            onChange={selection.onToggle}
          />
        ) : null}
        <Link
          href={href}
          className="text-[0.9375rem] font-semibold text-brand-700"
        >
          {name}
        </Link>
        <Badge tone="neutral">
          {bookmark.universe === "material"
            ? t.universeMaterial
            : t.universeProcess}
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
    </div>
  );
}

function BookmarkList({
  bookmarks,
  emptyTitle,
  selected,
  onToggle,
}: {
  bookmarks: Bookmark[];
  emptyTitle: string;
  selected?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
}) {
  // Absence is written out, never an empty panel (D-24): a blank area reads as
  // "this failed to load", which is a different thing from "you have not
  // starred anything yet". The card above already carries the hint, so the
  // empty state does not repeat it (D-205).
  if (bookmarks.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }
  return (
    <div className="flex flex-col gap-2">
      {bookmarks.map((bookmark, index) => (
        <BookmarkRow
          key={`${bookmark.universe}-${bookmark.material?.id ?? bookmark.process?.id}`}
          bookmark={bookmark}
          index={index}
          selection={
            selected && onToggle
              ? {
                  checked: selected.has(bookmarkKey(bookmark)),
                  onToggle: () => onToggle(bookmarkKey(bookmark)),
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function OwnRecords({ records }: { records: MaterialListItem[] }) {
  if (records.length === 0) {
    return (
      <EmptyState title={t.ownRecordsEmpty} description={t.ownRecordsHint} />
    );
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
  const [filters, setFilters] = useUrlState(MY_RECORDS_URL);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const undoableDelete = useUndoableDelete();

  const data = query.data;
  const favorites = data ? filterBookmarks(data.favorites, filters) : [];
  const recents = data ? filterBookmarks(data.recents, filters) : [];
  const own = data ? filterOwn(data.own_records, filters) : [];
  const classes = data
    ? classOptions([...data.favorites, ...data.recents], data.own_records)
    : [];
  const filtering =
    filters.q.trim() !== "" ||
    filters.classe !== "" ||
    filters.tipo !== "todos";

  // A selection that the filter hides is dropped from the action: the reader
  // never acts on a row they cannot see.
  const picked = favorites.filter((b) => selected.has(bookmarkKey(b)));
  const pickedMaterials = picked.flatMap((b) =>
    b.material ? [b.material.id] : [],
  );

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const unfavorite = () => {
    const doomed = picked;
    setConfirming(false);
    setSelected(new Set());
    const keys = new Set(doomed.map(bookmarkKey));
    undoableDelete({
      what: t.favorites,
      message: t.unfavorited(doomed.length),
      hide: [
        {
          queryKey: MY_RECORDS_KEY,
          remove: (old) => {
            const records = old as MyRecords | undefined;
            return records
              ? {
                  ...records,
                  favorites: records.favorites.filter(
                    (b) => !keys.has(bookmarkKey(b)),
                  ),
                }
              : old;
          },
        },
      ],
      commit: () =>
        Promise.all(
          doomed.map((b) =>
            removeFavorite(
              b.universe,
              (b.material?.id ?? b.process?.id) as number,
            ),
          ),
        ),
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      {/* D-230: the server reads this person's own records, so the screen sends nothing;
          comparing opens the comparison screen and a route opens a sheet — both links. */}
      <AISuggestPanel
        tool="registros"
        context={{}}
        actions={["compare", "open_route"]}
        linkFor={(action) =>
          action.type === "compare" ? `/app/comparar?materiais=${encodeIdList(action.ids)}` : null
        }
        onAction={() => undefined}
      />

      {query.isLoading && <ListSkeleton variant="rows" count={4} />}
      {query.isError && (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      )}

      {data && (
        <>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Input
                type="search"
                label={t.search}
                hint={t.searchHint}
                className="w-full max-w-sm"
                value={filters.q}
                onChange={(e) => setFilters({ q: e.target.value })}
              />
              <p className="text-body text-ink-muted" aria-live="polite">
                {t.count(favorites.length + recents.length + own.length)}
              </p>
            </div>
            <FilterBar
              fields={[
                {
                  id: "classe",
                  label: t.filterClass,
                  pinned: true,
                  value: filters.classe || null,
                  options: classes,
                },
                {
                  id: "tipo",
                  label: t.filterKind,
                  pinned: true,
                  value: filters.tipo === "todos" ? null : filters.tipo,
                  options: [
                    { value: "material", label: t.kindMaterial },
                    { value: "processo", label: t.kindProcess },
                  ],
                },
              ]}
              onChange={(id, value) =>
                id === "classe"
                  ? setFilters({ classe: value ?? "" })
                  : setFilters({
                      tipo: (RECORD_KINDS as readonly string[]).includes(
                        value ?? "",
                      )
                        ? (value as RecordKind)
                        : "todos",
                    })
              }
              onClear={() => setFilters({ classe: "", tipo: "todos" })}
            />
          </div>

          {/* Side by side: two short lists stacked left most of the screen
              blank, and favourites and recents are read together anyway. */}
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <StepCard title={t.favorites} description={t.favoritesHint}>
              {picked.length > 0 ? (
                <div
                  role="group"
                  aria-label={t.selected(picked.length)}
                  className="mb-3 flex flex-wrap items-center gap-2 rounded-control bg-surface-sunken px-3 py-2"
                >
                  <span className="text-body text-ink" aria-live="polite">
                    {t.selected(picked.length)}
                  </span>
                  {pickedMaterials.length >= 2 ? (
                    <ButtonLink
                      size="sm"
                      href={`/app/comparar?materiais=${encodeIdList(pickedMaterials)}`}
                    >
                      {t.compareSelected}
                    </ButtonLink>
                  ) : (
                    <Button size="sm" disabled title={t.compareNeedTwo}>
                      {t.compareSelected}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="tonal"
                    onClick={() => setConfirming(true)}
                  >
                    {t.unfavoriteSelected}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelected(new Set())}
                  >
                    {t.clearSelection}
                  </Button>
                </div>
              ) : null}
              <BookmarkList
                bookmarks={favorites}
                emptyTitle={filtering ? t.noMatch : t.favoritesEmpty}
                selected={selected}
                onToggle={toggle}
              />
            </StepCard>

            <StepCard title={t.recents} description={t.recentsHint}>
              <BookmarkList
                bookmarks={recents}
                emptyTitle={filtering ? t.noMatch : t.recentsEmpty}
              />
            </StepCard>
          </div>

          <Section title={t.ownRecords} description={t.ownRecordsHint}>
            {filtering && own.length === 0 ? (
              <EmptyState title={t.noMatch} />
            ) : (
              <OwnRecords records={own} />
            )}
          </Section>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        title={t.confirmTitle(picked.length)}
        message={t.confirmMessage}
        confirmLabel={t.unfavoriteSelected}
        onConfirm={unfavorite}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
