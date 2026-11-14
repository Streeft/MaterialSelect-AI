"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getMyRecords, listStudies, runStudy } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { compareViewText } from "@/lib/i18n-compare-view";
import type { Bookmark } from "@/lib/types";
import { MY_RECORDS_KEY } from "@/components/my-records/FavoriteButton";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  ErrorState,
  ListSkeleton,
} from "@/components/ui";
import { resolveClassicPairs } from "@/lib/compareClassics";

const t = compareViewText.empty;

/** Shortcuts per group: a shelf, not a history (the full list is "Meus registros"). */
const SHOWN = 8;

/** D-232: how many candidates of a study the shortcut carries — a shortlist, not the whole result. */
export const STUDY_TOP = 5;

/**
 * The first `STUDY_TOP` candidates of a run, in the order the server ranked
 * them. A candidate with no rank (a study without an objective) follows the
 * ranked ones, in the order it came — nothing is scored or reordered here.
 */
export function topCandidates(
  candidates: readonly { record_id: number; rank: number | null }[],
  limit = STUDY_TOP,
): number[] {
  const ranked = candidates.filter((c) => c.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const unranked = candidates.filter((c) => c.rank === null);
  return [...ranked, ...unranked].slice(0, limit).map((c) => c.record_id);
}

interface Suggestion {
  id: number;
  name: string;
}

/** The materials of a bookmark list, once each, without those already on the table. */
function materialsOf(
  bookmarks: Bookmark[],
  skip: ReadonlySet<number>,
  seen: Set<number>,
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const bookmark of bookmarks) {
    const material = bookmark.material;
    if (bookmark.universe !== "material" || !material || !material.name) continue;
    if (skip.has(material.id) || seen.has(material.id)) continue;
    seen.add(material.id);
    out.push({ id: material.id, name: material.name });
  }
  return out;
}

/**
 * D-232: "top do último estudo". The reader's most recent saved study of
 * materials, run again on click (the numbers are the server's, never kept
 * here), its first candidates handed to the comparator. Nothing is drawn until
 * there is such a study; a failed run says so and can be tried again.
 */
function LastStudyShelf({ onAdd }: { onAdd: (ids: number[]) => void }) {
  const studies = useQuery({ queryKey: ["studies"], queryFn: listStudies });
  const [tooFew, setTooFew] = useState<string | null>(null);
  const latest = [...(studies.data ?? [])]
    .filter((s) => s.universe === "material")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const run = useMutation({
    mutationFn: (id: number) => runStudy(id),
    onSuccess: (result, id) => {
      const ids = topCandidates(result.candidates);
      if (ids.length < 2) {
        setTooFew(latest && latest.id === id ? latest.name : "");
        return;
      }
      setTooFew(null);
      onAdd(ids);
    },
  });

  if (!latest) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-body font-semibold text-ink">{t.lastStudy}</h3>
        <p className="text-caption text-ink-muted">{t.lastStudyHint(STUDY_TOP)}</p>
      </div>
      <div>
        <Button
          size="sm"
          variant="tonal"
          loading={run.isPending}
          onClick={() => {
            setTooFew(null);
            run.mutate(latest.id);
          }}
        >
          {t.compareStudyTop(latest.name)}
        </Button>
      </div>
      {tooFew !== null ? <Alert tone="warning" role="status">{t.studyTooFew(tooFew)}</Alert> : null}
      {run.isError ? <Alert tone="danger" role="alert">{describeApiError(run.error)}</Alert> : null}
    </div>
  );
}

function Shelf({
  title,
  what,
  items,
  onAdd,
}: {
  title: string;
  what: string;
  items: Suggestion[];
  onAdd: (ids: number[]) => void;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, SHOWN);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-ink">{title}</h3>
        {shown.length >= 2 ? (
          <Button size="sm" variant="tonal" onClick={() => onAdd(shown.map((item) => item.id))}>
            {t.compareAll(shown.length, what)}
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-2">
        {shown.map((item) => (
          <li key={item.id} className="min-w-0 max-w-full">
            <Button
              size="sm"
              variant="secondary"
              className="max-w-full break-words"
              aria-label={t.addOne(item.name)}
              onClick={() => onAdd([item.id])}
            >
              {item.name}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the comparator says before anything is chosen (D-214): why it needs two
 * or more materials and where to get them from. The shortcuts are what the app
 * already keeps for the reader — the materials they starred and the ones they
 * opened last, from the same `/my-records` payload (and query key) the sheet's
 * star and the home page read — so no new endpoint and no new state. A
 * suggestion is only a way to fill step 1: the comparison itself is the same
 * request as one built by hand.
 */
export function CompareSuggestions({
  chosen,
  onAdd,
  catalogue = [],
}: {
  chosen: readonly number[];
  onAdd: (ids: number[]) => void;
  /** D-221/D-230: the catalogue the classic pairs are looked up in, by name and class. */
  catalogue?: readonly { id: number; name: string; class_slug: string }[];
}) {
  const classics = resolveClassicPairs(catalogue);
  const records = useQuery({ queryKey: MY_RECORDS_KEY, queryFn: getMyRecords });
  const skip = new Set(chosen);
  const seen = new Set<number>();
  const favorites = materialsOf(records.data?.favorites ?? [], skip, seen);
  const recents = materialsOf(records.data?.recents ?? [], skip, seen);
  const nothing = records.data !== undefined && favorites.length === 0 && recents.length === 0;

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading text-ink">{t.title}</h2>
          <p className="max-w-prose text-body text-ink-muted">{t.body}</p>
        </div>

        {records.isPending && <ListSkeleton label={t.loading} count={2} />}
        {records.isError && <ErrorState error={records.error} onRetry={() => void records.refetch()} />}

        {records.data && (
          <>
            <Shelf title={t.favorites} what={t.whatFavorites} items={favorites} onAdd={onAdd} />
            <Shelf title={t.recents} what={t.whatRecents} items={recents} onAdd={onAdd} />
          </>
        )}

        <LastStudyShelf onAdd={onAdd} />

        {/* D-221: the third way in — pairs every course compares first, each
            found in this catalogue by name; a pair it lacks is not offered. */}
        {classics.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-body font-semibold text-ink">{t.classics}</h3>
              <p className="text-caption text-ink-muted">{t.classicsHint}</p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {classics.map((pair) => (
                <li key={pair.ids.join("-")} className="min-w-0 max-w-full">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="max-w-full break-words"
                    aria-label={t.comparePair(pair.names[0], pair.names[1])}
                    title={`${pair.names[0]} × ${pair.names[1]}`}
                    onClick={() => onAdd([...pair.ids])}
                  >
                    {pair.labels[0]} × {pair.labels[1]}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {nothing && (
          <div className="flex flex-col items-start gap-3">
            <p className="max-w-prose text-body text-ink-muted">{t.nothingYet}</p>
            <ButtonLink href="/app/catalogo" size="sm" variant="secondary">
              {t.browse}
            </ButtonLink>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
