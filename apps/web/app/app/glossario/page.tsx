"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProperties } from "@/lib/api";
import { glossaryQuery, matchesFilter, reviewLabel } from "@/lib/glossary";
import { ptBR } from "@/lib/i18n";
import type { GlossaryEntry } from "@/lib/types";
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

const t = ptBR.glossary;

/**
 * Glossário de propriedades (D-130): o que cada grandeza significa e como se
 * mede, com fonte, licença e estado de revisão escritos em cada verbete.
 *
 * Conceitual, nunca numérico — o backend recusa verbete com número e unidade.
 * A propriedade do catálogo que não tem verbete aparece na lista com a ausência
 * escrita, nunca omitida nem preenchida com texto inventado.
 */
export default function GlossaryPage() {
  const entries = useQuery(glossaryQuery);
  // Os nomes vêm do catálogo; sem eles a lista cai no slug, nunca some.
  const properties = useQuery({ queryKey: ["properties"], queryFn: () => listProperties() });
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const bySlug = new Map<string, { slug: string; name: string; entry: GlossaryEntry | null }>();
    for (const e of entries.data ?? []) bySlug.set(e.slug, { slug: e.slug, name: e.slug, entry: e });
    for (const p of properties.data ?? []) {
      const row = bySlug.get(p.slug);
      if (row) row.name = p.name;
      else bySlug.set(p.slug, { slug: p.slug, name: p.name, entry: null });
    }
    return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [entries.data, properties.data]);

  const shown = rows.filter((r) => matchesFilter(r.name, r.slug, filter));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} group="dados" />
      <GlossaryNav current="propriedades" />

      {(entries.isLoading || properties.isLoading) && <LoadingState label={t.loading} />}
      {entries.isError && <ErrorState title={t.error} onRetry={() => void entries.refetch()} />}

      {entries.data &&
        !properties.isLoading &&
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
                    <EntryCard name={r.name} slug={r.slug} entry={r.entry} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ))}
    </div>
  );
}

function EntryCard({
  name,
  slug,
  entry,
}: {
  name: string;
  slug: string;
  entry: GlossaryEntry | null;
}) {
  const headingId = `glossario-${slug}`;
  return (
    <Card as="article" aria-labelledby={headingId}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={headingId} className="text-base font-semibold text-ink">
            {name} <span className="font-mono text-sm font-normal text-ink-subtle">{slug}</span>
          </h2>
          {entry && (
            <Badge tone={entry.review_status === "revisado" ? "success" : "warning"}>
              {reviewLabel(entry.review_status)}
            </Badge>
          )}
        </div>
        {entry ? (
          <>
            <p className="text-sm text-ink">{entry.summary}</p>
            <dl className="well grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium text-ink-muted">{t.definition}</dt>
              <dd className="text-ink">{entry.definition}</dd>
              <dt className="font-medium text-ink-muted">{t.howMeasured}</dt>
              <dd className="text-ink">{entry.how_measured ?? t.howMeasuredMissing}</dd>
              <dt className="font-medium text-ink-muted">{t.reference}</dt>
              <dd className="text-ink">{entry.reference ?? t.referenceMissing}</dd>
              <dt className="font-medium text-ink-muted">{t.license}</dt>
              <dd className="text-ink">{entry.license}</dd>
              <dt className="font-medium text-ink-muted">{t.review}</dt>
              <dd className="text-ink">{reviewLabel(entry.review_status)}</dd>
            </dl>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            <strong className="font-medium">{t.missing}.</strong> {t.missingHint}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
