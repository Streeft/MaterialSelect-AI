"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { MaterialDetail, Similar } from "@/lib/types";
import { findSimilar, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  ErrorState,
  Section,
} from "@/components/ui";

const t = ptBR.similar;

/**
 * The basis a sheet proposes when the reader has not chosen one.
 *
 * The *interface* may propose; the request must state. The server refuses an
 * empty basis on purpose, so that the catalogue's recording habits can never
 * choose the question silently — but a reader arriving at a datasheet should
 * not have to build one from nothing either, so the properties this material
 * actually carries are pre-ticked and visible as ticks, which is the difference
 * between a proposal and a default.
 */
function proposedBasis(material: MaterialDetail): string[] {
  return material.property_groups
    .flatMap((group) => group.properties)
    .filter((property) => !property.is_missing)
    .map((property) => property.property_slug);
}

function NamedList({
  title,
  hint,
  items,
}: {
  title: string;
  hint: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink">{title}</span>
      <span className="text-xs text-ink-muted">{hint}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((label) => (
          <Badge key={label}>{label}</Badge>
        ))}
      </div>
    </div>
  );
}

/**
 * Find Similar for one material (P2).
 *
 * The answer always shows its basis, the records it could not place and why,
 * and the properties that turned out to separate nobody. Those three are not
 * diagnostics for a developer: a ranked list without them is a verdict, and the
 * point of the feature is that a reader can check it.
 */
export function SimilarPanel({ material }: { material: MaterialDetail }) {
  const [basis, setBasis] = useState<string[]>(() => proposedBasis(material));
  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });

  const search = useMutation<Similar, Error>({
    mutationFn: () => findSimilar(material.id, { property_slugs: basis, limit: 10 }),
  });

  function toggle(slug: string) {
    setBasis((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  }

  const result = search.data;

  return (
    <Section id="semelhantes" title={t.title} description={t.hint}>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink">{t.basisLabel}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(properties.data ?? []).map((property) => (
                <Checkbox
                  key={property.slug}
                  label={property.name}
                  checked={basis.includes(property.slug)}
                  onChange={() => toggle(property.slug)}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={basis.length === 0 || search.isPending}
              onClick={() => search.mutate()}
            >
              {search.isPending ? t.loading : t.search}
            </Button>
            {/* Written, not a disabled button with no explanation (D-24). */}
            {basis.length === 0 && (
              <span className="text-xs text-ink-muted">{t.basisEmpty}</span>
            )}
          </div>

          {search.isError && <ErrorState description={search.error.message} />}

          {result && (
            <div className="flex flex-col gap-4">
              <NamedList title={t.basisUsed} hint={t.distanceHint} items={result.basis_labels} />

              {result.neighbours.length === 0 ? (
                <EmptyState title={t.empty} description={t.excludedHint} />
              ) : (
                <ol className="flex flex-col gap-2">
                  {result.neighbours.map((neighbour) => (
                    <li key={neighbour.record_id}>
                      <Card>
                        <CardBody className="flex flex-wrap items-center justify-between gap-3">
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="text-xs text-ink-muted">{neighbour.rank}.</span>
                            <Link
                              href={`/app/materiais/${neighbour.record_id}`}
                              className="text-[0.9375rem] font-semibold text-brand-700"
                            >
                              {neighbour.name}
                            </Link>
                            {neighbour.is_demo && (
                              <Badge tone="warning">{ptBR.demoBadge}</Badge>
                            )}
                            {neighbour.is_own_record && (
                              <Badge tone="info">{ptBR.myRecords.ownBadge}</Badge>
                            )}
                          </span>
                          <span className="text-xs text-ink-muted">
                            {t.distance}: {formatNumber(neighbour.distance)}
                          </span>
                        </CardBody>
                      </Card>
                    </li>
                  ))}
                </ol>
              )}

              <NamedList
                title={t.degenerateTitle}
                hint={t.degenerateHint}
                items={result.degenerate_labels}
              />
              <NamedList
                title={t.linearTitle}
                hint={t.linearHint}
                items={result.linear_fallback_labels}
              />

              {result.excluded.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-ink">{t.excludedTitle}</span>
                  <span className="text-xs text-ink-muted">{t.excludedHint}</span>
                  <ul className="flex flex-col gap-1">
                    {result.excluded.map((item) => (
                      <li key={item.record_id} className="text-xs text-ink-muted">
                        {item.name} — {t.excludedMissing} {item.missing_labels.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!result && !search.isPending && (
            <Alert tone="info">{t.distanceHint}</Alert>
          )}
        </CardBody>
      </Card>
    </Section>
  );
}
