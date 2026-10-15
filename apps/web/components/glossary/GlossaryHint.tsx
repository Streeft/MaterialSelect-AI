"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Popover } from "@/components/ui";
import { ptBR } from "@/lib/i18n";
import { findEntry, glossaryHref, glossaryQuery, reviewLabel } from "@/lib/glossary";

const t = ptBR.glossary;

/**
 * "?" next to a property name: the glossary entry's summary, its review state
 * and a link to the full entry (D-130).
 *
 * The body is a separate component on purpose: the popover only mounts its
 * children when open, so a closed hint makes no request — a table of fifteen
 * properties does not cost fifteen calls, and screens that never open one never
 * reach the glossary endpoint at all.
 */
export function GlossaryHint({
  slug,
  name,
  className,
}: {
  slug: string;
  /** The property's display name — the trigger's accessible name uses it. */
  name: string;
  className?: string;
}) {
  return (
    <Popover
      label={t.hintLabel(name)}
      className={className}
      trigger={
        <span
          aria-hidden
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-edge-control text-[0.625rem] font-semibold leading-none text-ink-muted"
        >
          ?
        </span>
      }
    >
      <GlossaryHintBody slug={slug} name={name} />
    </Popover>
  );
}

function GlossaryHintBody({ slug, name }: { slug: string; name: string }) {
  const query = useQuery(glossaryQuery);

  if (query.isLoading) return <p className="text-ink-muted">{t.hintLoading}</p>;
  if (query.isError) return <p className="text-danger-fg">{t.hintError}</p>;

  const entry = findEntry(query.data, slug);
  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold text-ink">{name}</p>
      {entry ? (
        <>
          <p className="text-ink">{entry.summary}</p>
          <p className="text-ink-muted">
            {t.review}: {reviewLabel(entry.review_status)}
          </p>
          <Link
            href={glossaryHref(slug)}
            className="rounded-control text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t.seeInGlossary}
          </Link>
        </>
      ) : (
        <p className="text-ink-muted">{t.missing}</p>
      )}
    </div>
  );
}
