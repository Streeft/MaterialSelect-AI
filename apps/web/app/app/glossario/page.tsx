"use client";

import { Suspense, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProperties } from "@/lib/api";
import { glossaryQuery, matchesFilter, reviewLabel } from "@/lib/glossary";
import { ptBR } from "@/lib/i18n";
import { mapHrefForAxis } from "@/app/app/mapas/mapUrl";
import {
  enumCodec,
  textCodec,
  useUrlState,
  type UrlSpec,
} from "@/lib/urlState";
import { useDebounced } from "@/lib/useDebounced";
import type { GlossaryEntry } from "@/lib/types";
import { GlossaryNav } from "@/components/glossary/GlossaryNav";
import {
  Badge,
  ButtonLink,
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

/** D-219: the search and the review-state chip live in the address, as the other screens' do. */
const GLOSSARY_URL: UrlSpec<{ busca: string; estado: "" | State }> = {
  busca: { param: "busca", codec: textCodec, defaultValue: "" },
  estado: {
    param: "estado",
    codec: enumCodec(["", "revisado", "rascunho", "ausente"] as const),
    defaultValue: "",
  },
};

/** Letter of the index: accent and case folded, so "Á" files under "A". */
function letterOf(name: string): string {
  const first = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .charAt(0)
    .toUpperCase();
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
 * Glossário de propriedades (D-130b), como wiki (D-209): um índice compacto
 * por letra e o verbete inteiro aberto ao lado (`SidePeek`). A página antiga
 * imprimia cada verbete por extenso e chegava a 54 mil pixels no celular.
 *
 * Conceitual, nunca numérico — o backend recusa verbete com número e unidade.
 * A propriedade do catálogo que não tem verbete aparece no índice com a
 * ausência escrita, nunca omitida nem preenchida com texto inventado.
 */
export default function GlossaryPage() {
  // `useSearchParams` (inside `useUrlState`) needs a boundary, or `next build` refuses the page.
  return (
    <Suspense fallback={<LoadingState label={t.loading} />}>
      <GlossaryPageContent />
    </Suspense>
  );
}

function GlossaryPageContent() {
  const entries = useQuery(glossaryQuery);
  // Os nomes vêm do catálogo; sem eles a lista cai no slug, nunca some.
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: () => listProperties(),
  });
  const [url, setUrl] = useUrlState(GLOSSARY_URL);
  const filter = url.busca;
  // The box answers every keystroke; the list of ~100 rows waits for a pause.
  const settled = useDebounced(filter, 200);
  const state: State | null = url.estado || null;
  const setState = (next: State | null) => setUrl({ estado: next ?? "" });
  const openSlug = useSyncExternalStore(subscribeHash, readHash, noHash);

  const rows = useMemo(() => {
    const bySlug = new Map<string, Row>();
    for (const e of entries.data ?? [])
      bySlug.set(e.slug, { slug: e.slug, name: e.slug, entry: e });
    for (const p of properties.data ?? []) {
      const row = bySlug.get(p.slug);
      if (row) row.name = p.name;
      else bySlug.set(p.slug, { slug: p.slug, name: p.name, entry: null });
    }
    return [...bySlug.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
  }, [entries.data, properties.data]);

  const shown = rows.filter(
    (r) =>
      matchesFilter(r.name, r.slug, settled) &&
      (state === null ||
        (r.entry ? r.entry.review_status : "ausente") === state),
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

      {(entries.isLoading || properties.isLoading) && (
        <LoadingState label={t.loading} />
      )}
      {entries.isError && (
        <ErrorState title={t.error} onRetry={() => void entries.refetch()} />
      )}

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
                  onChange={(e) => setUrl({ busca: e.target.value })}
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
                <nav
                  aria-label={t.lettersLabel}
                  className="flex flex-wrap gap-1"
                >
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
                          ?.scrollIntoView({
                            block: "start",
                            behavior: "smooth",
                          });
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
              <EmptyState title={t.noMatch(settled.trim())} />
            ) : (
              <div className="flex flex-col gap-6">
                {groups.map(([letter, items]) => (
                  <section
                    key={letter}
                    id={`letra-${letter}`}
                    aria-labelledby={`letra-${letter}-t`}
                    className="scroll-mt-24"
                  >
                    <h2
                      id={`letra-${letter}-t`}
                      className="mb-2 text-heading text-ink"
                    >
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

      <SidePeek
        open={open !== null}
        title={open?.name ?? ""}
        onClose={() => setHash(null)}
      >
        {open ? <EntryDetail row={open} /> : null}
      </SidePeek>
    </div>
  );
}

function EntryDetail({ row }: { row: Row }) {
  const { entry } = row;
  if (!entry) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-muted">
          <strong className="font-medium">{t.missing}.</strong> {t.missingHint}
        </p>
        <UseLinks slug={row.slug} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink">{entry.summary}</p>
      <PropertyList
        dense
        items={[
          { label: t.definition, value: entry.definition },
          {
            label: t.howMeasured,
            value: entry.how_measured ?? t.howMeasuredMissing,
          },
          { label: t.reference, value: entry.reference ?? t.referenceMissing },
          { label: t.license, value: entry.license },
          { label: t.review, value: reviewLabel(entry.review_status) },
          {
            label: t.identifier,
            value: <code className="font-mono text-caption">{row.slug}</code>,
          },
        ]}
      />
      <UseLinks slug={row.slug} />
    </div>
  );
}

/** From the entry to the two places the property is used (D-219): as a map axis, as a limit. */
function UseLinks({ slug }: { slug: string }) {
  return (
    <div role="group" aria-label={t.useTitle} className="flex flex-wrap gap-2">
      <ButtonLink size="sm" variant="tonal" href={mapHrefForAxis(slug)}>
        {t.useAsAxis}
      </ButtonLink>
      <ButtonLink
        size="sm"
        variant="tonal"
        href={`/app/selecao?etapa=restricoes&restricao=${encodeURIComponent(slug)}`}
      >
        {t.useAsConstraint}
      </ButtonLink>
    </div>
  );
}
