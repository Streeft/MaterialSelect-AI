"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listClasses } from "@/lib/api";
import { familyNotesQuery } from "@/lib/familyNotes";
import { matchesFilter, reviewLabel } from "@/lib/glossary";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import type { FamilyNoteEntry } from "@/lib/types";
import { FamilyNoteContent } from "@/components/glossary/FamilyNote";
import { GlossaryNav } from "@/components/glossary/GlossaryNav";
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
} from "@/components/ui";

const t = ptBR.familyNotes;

const LINK_CLASS =
  "rounded-control text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

interface Row {
  slug: string;
  name: string;
  inCatalog: boolean;
  note: FamilyNoteEntry | null;
}

/**
 * Glossário de famílias (D-151): o que cada família de materiais é, por que se
 * comporta assim, onde se usa e o que conferir ao escolhê-la.
 *
 * Página irmã de `/app/glossario`, não uma aba dentro dela: cada metade tem o
 * próprio endereço, então o `#slug` vindo da ficha do material cai na nota
 * certa sem depender de estado da tela. Lista as famílias de topo do catálogo
 * e toda família que tenha nota; a que não tem aparece com a ausência escrita.
 */
export default function FamilyNotesPage() {
  const notes = useQuery(familyNotesQuery);
  // Os nomes vêm do catálogo; sem eles a lista cai no slug, nunca some.
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => listClasses() });
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const bySlug = new Map<string, Row>();
    for (const n of notes.data ?? []) {
      bySlug.set(n.slug, { slug: n.slug, name: n.slug, inCatalog: false, note: n });
    }
    for (const c of classes.data ?? []) {
      const row = bySlug.get(c.slug);
      if (row) {
        row.name = c.name;
        row.inCatalog = true;
      } else if (c.parent_id === null) {
        // Only top-level families get a "no note" card: an official catalogue
        // can bring hundreds of sub-folders, and a wall of absences hides the
        // notes that exist. A sub-folder with a note is still listed above.
        bySlug.set(c.slug, { slug: c.slug, name: c.name, inCatalog: true, note: null });
      }
    }
    return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [notes.data, classes.data]);

  const shown = rows.filter((r) => matchesFilter(r.name, r.slug, filter));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} group="dados" />
      <GlossaryNav current="familias" />

      {(notes.isLoading || classes.isLoading) && <LoadingState label={t.loading} />}
      {notes.isError && <ErrorState title={t.error} onRetry={() => void notes.refetch()} />}

      {notes.data &&
        !classes.isLoading &&
        (rows.length === 0 ? (
          <EmptyState title={t.empty} />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Input
                type="search"
                label={t.filter}
                hint={t.filterHint}
                className="w-full max-w-sm"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <p className="text-sm text-ink-muted" aria-live="polite">
                {t.count(shown.length)}
              </p>
            </div>
            {shown.length === 0 ? (
              <EmptyState title={t.noMatch(filter.trim())} />
            ) : (
              <ul className="flex flex-col gap-4">
                {shown.map((r) => (
                  <li key={r.slug} id={r.slug} className="scroll-mt-24">
                    <NoteCard row={r} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ))}
    </div>
  );
}

function NoteCard({ row }: { row: Row }) {
  const headingId = `familia-${row.slug}`;
  return (
    <Card as="article" aria-labelledby={headingId}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={headingId} className="text-base font-semibold text-ink">
            {row.name}{" "}
            <span className="font-mono text-sm font-normal text-ink-subtle">{row.slug}</span>
          </h2>
          {row.note && (
            <Badge tone={row.note.review_status === "revisado" ? "success" : "warning"}>
              {reviewLabel(row.note.review_status)}
            </Badge>
          )}
        </div>
        {row.note ? (
          <FamilyNoteContent note={row.note} />
        ) : (
          <p className="text-sm text-ink-muted">
            <strong className="font-medium">{t.missing}.</strong> {t.missingHint}
          </p>
        )}
        {row.inCatalog && (
          <Link
            href={`/app/catalogo/${encodeURIComponent(row.slug)}`}
            className={cn("self-start text-support", LINK_CLASS)}
          >
            {t.seeInCatalog}
          </Link>
        )}
      </CardBody>
    </Card>
  );
}
