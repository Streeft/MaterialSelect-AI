"use client";

import { useQuery } from "@tanstack/react-query";
import { findEntry, glossaryQuery } from "@/lib/glossary";
import { GlossaryHint } from "./GlossaryHint";

/**
 * The glossary "?" for places where an absent entry must stay silent: a
 * comparison table header or an axis picker (GL-b, D-130).
 *
 * `GlossaryHint` writes "sem verbete" when opened, which is right on the
 * material sheet but noise in the middle of a table. Here the entry is looked
 * up first, from the one shared query (`staleTime: Infinity`, so a screen with
 * six headers still makes a single request), and nothing is drawn while it
 * loads, if it fails, or when the slug has no entry. The glossary is a help,
 * never a precondition for reading the figure.
 */
export function PropertyHint({
  slug,
  name,
  className,
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  const query = useQuery(glossaryQuery);
  if (!findEntry(query.data, slug)) return null;
  return <GlossaryHint slug={slug} name={name} className={className} />;
}
