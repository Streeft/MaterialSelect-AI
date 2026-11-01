"use client";

import { useId } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button, Disclosure } from "@/components/ui";
import { cn } from "@/lib/cn";
import { familyNoteHref, familyNotesQuery, findFamilyNote } from "@/lib/familyNotes";
import { reviewLabel } from "@/lib/glossary";
import { ptBR } from "@/lib/i18n";
import type { FamilyNoteEntry } from "@/lib/types";

const t = ptBR.familyNotes;

const LINK_CLASS =
  "rounded-control text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * A family's note (D-151) under the class line of a material sheet.
 *
 * Folded by default: the sheet is about the material, and the note is about the
 * family it belongs to — a reader who wants it opens it, everyone else keeps the
 * header short. Every state is written: loading, error (with a retry), and a
 * family without a note, which reads "Sem nota para esta família" and never as
 * an empty disclosure (D-24). The review state rides on the summary line in
 * words, never only as a color.
 *
 * Inside the sheet's header card, so the disclosure is `flush` — a divider and
 * a summary, not a second box (D-91).
 */
export function FamilyNote({
  slug,
  name,
  className,
}: {
  /** The material class slug — the note's key. */
  slug: string;
  /** The class display name, from the catalogue. */
  name: string;
  className?: string;
}) {
  const query = useQuery(familyNotesQuery);

  if (query.isLoading) {
    return (
      <p role="status" className={cn("text-support text-ink-muted", className)}>
        {t.inlineLoading}
      </p>
    );
  }
  if (query.isError) {
    return (
      <p className={cn("flex flex-wrap items-center gap-2 text-support text-ink-muted", className)}>
        <span>{t.inlineError}</span>
        <Button size="sm" variant="link" onClick={() => void query.refetch()}>
          {t.retry}
        </Button>
      </p>
    );
  }

  const note = findFamilyNote(query.data, slug);
  if (!note) {
    return (
      <p className={cn("text-support text-ink-muted", className)}>
        <strong className="font-medium">{t.missing}.</strong>
      </p>
    );
  }

  return (
    <Disclosure
      flush
      className={className}
      summary={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>{t.about(name)}</span>
          <span className="text-support font-normal text-ink-muted">
            {reviewLabel(note.review_status)}
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <FamilyNoteContent note={note} />
        <Link href={familyNoteHref(slug)} className={cn("self-start text-support", LINK_CLASS)}>
          {t.seeAll}
        </Link>
      </div>
    </Disclosure>
  );
}

/**
 * The note itself: summary, short paragraphs, the two lists in wells, and the
 * reference, license and review state written out. Shared by the sheet and the
 * glossary page so the two cannot drift.
 */
export function FamilyNoteContent({ note }: { note: FamilyNoteEntry }) {
  const base = useId();
  const whenId = `${base}-when`;
  const watchId = `${base}-watch`;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="max-w-prose font-medium text-ink">{note.summary}</p>
      {note.body.map((paragraph, i) => (
        <p key={i} className="max-w-prose text-ink">
          {paragraph}
        </p>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="well flex flex-col gap-1.5">
          <p id={whenId} className="text-caption font-semibold text-ink-subtle">
            {t.whenToUse}
          </p>
          <ul aria-labelledby={whenId} className="list-disc space-y-1 pl-5 text-ink">
            {note.when_to_use.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="well flex flex-col gap-1.5">
          <p id={watchId} className="text-caption font-semibold text-ink-subtle">
            {t.watchOut}
          </p>
          <ul aria-labelledby={watchId} className="list-disc space-y-1 pl-5 text-ink">
            {note.watch_out.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <dl className="grid gap-x-3 gap-y-1 text-support sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <dt className="font-medium text-ink-muted">{t.reference}</dt>
        <dd className="text-ink">{note.reference ?? t.referenceMissing}</dd>
        <dt className="font-medium text-ink-muted">{t.license}</dt>
        <dd className="text-ink">{note.license}</dd>
        <dt className="font-medium text-ink-muted">{t.review}</dt>
        <dd className="text-ink">{reviewLabel(note.review_status)}</dd>
      </dl>
    </div>
  );
}
