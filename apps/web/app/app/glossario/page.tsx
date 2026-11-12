"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProperties } from "@/lib/api";
import { glossaryQuery, matchesFilter, reviewLabel } from "@/lib/glossary";
import { ptBR } from "@/lib/i18n";
import type { GlossaryEntry } from "@/lib/types";
import { GlossaryNav } from "@/components/glossary/GlossaryNav";
import {
  Badge,
  EmptyState,
  ErrorState,
  FilterBar,
  Input,
  LoadingState,
  PageHeader,
  PropertyList,
  SidePeek,
} from "@/components/ui";

const t = ptBR.glossary;

type Row = { slug: string; name: string; entry: GlossaryEntry | null };
type State = "revisado" | "rascunho" | "ausente";

/** Letter of the index: accent and case folded, so "Á" files under "A". */
function letterOf(name: string): string {
  const first = name.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

/**
 * The entry open beside the index lives in the address hash (`#densidade`),
 * which is also where `glossaryHref` points from every hint in the app. Read
 * through `useSyncExternalStore`: the server renders with no entry open, the
 * browser with the one in its address, and a hash change opens another.
 */
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => decodeURIComponent(window.location.hash.slice(1));
const noHash = () => "";

function setHash(slug: string | null) {
  const url = `${window.location.pathname}${window.location.search}${slug ? `#${encodeURIComponent(slug)}` : ""}`;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/**
 * Glossário de propriedades (D-130), como wiki (D-207): um índice compacto
 * por letra e o verbete inteiro aberto ao lado (`SidePeek`). A página antiga
 * imprimia cada verbete por extenso e chegava a 54 mil pixels no celular.
 *
 * Conceitual, nunca numérico — o backend recusa verbete com número e unidade.
 * A propriedade do catálogo que não tem verbete aparece no índice com a
 * ausência escrita, nunca omitida nem preenchida com texto inventado.
 */
export default function GlossaryPage() {
  const entries = useQuery(glossaryQuery);
  // Os nomes vêm do catálogo; sem eles a lista cai no slug, nunca some.
  const properties = useQuery({ queryKey: ["properties"], queryFn: () => listProperties() });
  const [filter, setFilter] = useState("");
  const [state, setState] = useState<State | null>(null);
  const openSlug = useSyncExternalStore(subscribeHash, readHash, noHash);

  const rows = useMemo(() => {
    const bySlug = new Map<string, Row>();
    for (const e of entries.data ?? []) bySlug.set(e.slug, { slug: e.slug, name: e.slug, entry: e });
    for (const p of properties.data ?? []) {
      const row = bySlug.get(p.slug);
      if (row) row.name = p.name;
      else bySlug.set(p.slug, { slug: p.slug, name: p.name, entry: null });
    }
    return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [entries.data, properties.data]);

  const shown = rows.filter(
    (r) =>
      matchesFilter(r.name, r.slug, filter) &&
      (state === null || (r.entry ? r.entry.review_status : "ausente") === state),
  );
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of shown) {
      const letter = letterOf(row.name);
      map.set(letter, [...(map.get(letter) ?? []), row]);
    }
    return [...map.entries()];
  }, [shown]);
  const open = rows.find((r) => r.slug === openSlug) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />
      <GlossaryNav current="propriedades" />

      {(entries.isLoading || properties.isLoading) && <LoadingState label={t.loading} />}
      {entries.isError && <ErrorState title={t.error} onRetry={() => void entries.refetch()} />}

      {entries.data &&
        !properties.isLoading &&
        (rows.length === 0 ? (
          <EmptyState title={t.empty} />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Input
                  type="search"
                  label={t.filter}
                  hint={t.filterHint}
                  className="w-full max-w-sm"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <p className="text-body text-ink-muted" aria-live="polite">
                  {t.count(shown.length)}
                </p>
              </div>
              <FilterBar
                fields={[
                  {
                    id: "estado",
                    label: t.filterState,
                    pinned: true,
                    value: state,
                    options: [
                      { value: "revisado", label: t.stateReviewed },
                      { value: "rascunho", label: t.stateDraft },
                      { value: "ausente", label: t.stateMissing },
                    ],
                  },
                ]}
                onChange={(_id, value) => setState(value as State | null)}
                onClear={() => setState(null)}
              />
              {groups.length > 1 ? (
                <nav aria-label={t.lettersLabel} className="flex flex-wrap gap-1">
                  {groups.map(([letter]) => (
                    <a
                      key={letter}
                      href={`#letra-${letter}`}
                      onClick={(event) => {
                        // Scroll to the letter without touching the hash,
                        // which belongs to the open entry.
                        event.preventDefault();
                        document
                          .getElementById(`letra-${letter}`)
                          ?.scrollIntoView({ block: "start", behavior: "smooth" });
                      }}
                      className="ds-letter m3-state"
                    >
                      {letter}
                    </a>
                  ))}
                </nav>
              ) : null}
            </div>

            {shown.length === 0 ? (
              <EmptyState title={t.noMatch(filter.trim())} />
            ) : (
              <div className="flex flex-col gap-6">
                {groups.map(([letter, items]) => (
                  <section key={letter} id={`letra-${letter}`} aria-labelledby={`letra-${letter}-t`} className="scroll-mt-24">
                    <h2 id={`letra-${letter}-t`} className="mb-2 text-heading text-ink">
                      {letter}
                    </h2>
                    <ul className="divide-y divide-line-divider rounded-card border border-line bg-panel">
                      {items.map((r) => (
                        <li key={r.slug} id={r.slug}>
                          <button
                            type="button"
                            onClick={() => setHash(r.slug)}
                            aria-label={t.openEntry(r.name)}
                            className="m3-state flex w-full flex-col gap-0.5 px-4 py-3 text-left sm:flex-row sm:items-baseline sm:gap-4"
                          >
                            <span className="text-body font-medium text-ink sm:w-64 sm:shrink-0">
                              {r.name}
                            </span>
                            <span className="min-w-0 flex-1 text-caption text-ink-muted">
                              {r.entry ? r.entry.summary : t.missing}
                            </span>
                            {r.entry?.review_status === "revisado" ? (
                              <Badge tone="success">{t.stateReviewed}</Badge>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        ))}

      <SidePeek open={open !== null} title={open?.name ?? ""} onClose={() => setHash(null)}>
        {open ? <EntryDetail row={open} /> : null}
      </SidePeek>
    </div>
  );
}

function EntryDetail({ row }: { row: Row }) {
  const { entry } = row;
  if (!entry) {
    return (
      <p className="text-body text-ink-muted">
        <strong className="font-medium">{t.missing}.</strong> {t.missingHint}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink">{entry.summary}</p>
      <PropertyList
        dense
        items={[
          { label: t.definition, value: entry.definition },
          { label: t.howMeasured, value: entry.how_measured ?? t.howMeasuredMissing },
          { label: t.reference, value: entry.reference ?? t.referenceMissing },
          { label: t.license, value: entry.license },
          { label: t.review, value: reviewLabel(entry.review_status) },
          { label: t.identifier, value: <code className="font-mono text-caption">{row.slug}</code> },
        ]}
      />
    </div>
  );
}
