"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { MaterialDetail, NearnessCriterion, Similar } from "@/lib/types";
import { findSimilar, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import {
  WEIGHT_OPTIONS,
  parseSettings,
  parseTolerance,
  parseToleranceInput,
  requestSettings,
  writeSettings,
  writeTolerance,
  type NearnessSettings,
} from "@/lib/similarSettings";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  RowHeader,
  Section,
  Select,
  SelectOption,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
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
export function SimilarPanel({
  material,
  unitChoices,
}: {
  material: MaterialDetail;
  /** The reader's units (D-70): they only print the tolerance bands. */
  unitChoices?: Record<string, string>;
}) {
  const [basis, setBasis] = useState<string[]>(() => proposedBasis(material));
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: listProperties,
  });
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // The settings live in the URL (D-120), so the same link asks the same question.
  const settings = useMemo(() => parseSettings(params), [params]);
  // The tolerance lives in the URL too (D-155); the field keeps what is typed,
  // so "2," on the way to "2,5" is not wiped by a re-parse.
  const [toleranceText, setToleranceText] = useState(() => {
    const value = parseTolerance(params);
    return value === null ? "" : formatNumber(value);
  });
  const tolerance = parseToleranceInput(toleranceText);

  function updateSettings(next: NearnessSettings) {
    const query = writeSettings(
      new URLSearchParams(params.toString()),
      next,
      basis,
    ).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function changeTolerance(text: string) {
    setToleranceText(text);
    const value = parseToleranceInput(text);
    // An invalid entry is reported in the field and never written to the link.
    if (value === "invalid") return;
    const query = writeTolerance(
      new URLSearchParams(params.toString()),
      value,
    ).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function setWeight(slug: string, weight: number) {
    updateSettings({
      ...settings,
      weights: { ...settings.weights, [slug]: weight },
    });
  }

  function setCriterion(slug: string, criterion: NearnessCriterion) {
    updateSettings({
      ...settings,
      criteria: { ...settings.criteria, [slug]: criterion },
    });
  }

  const search = useMutation<Similar, Error>({
    mutationFn: () =>
      findSimilar(
        material.id,
        {
          property_slugs: basis,
          limit: 10,
          ...requestSettings(settings, basis),
          ...(typeof tolerance === "number"
            ? { tolerance_pct: tolerance }
            : {}),
        },
        unitChoices,
      ),
  });

  const nameOf = (slug: string) =>
    properties.data?.find((property) => property.slug === slug)?.name ?? slug;

  function toggle(slug: string) {
    setBasis((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug],
    );
  }

  const result = search.data;

  return (
    <Section id="semelhantes" title={t.title} description={t.hint}>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink">
              {t.basisLabel}
            </legend>
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

          {basis.length > 0 && (
            <fieldset className="well flex flex-col gap-3">
              <legend className="text-sm font-medium text-ink">
                {t.settingsTitle}
              </legend>
              <p className="text-support text-ink-muted">{t.settingsHint}</p>
              {/* Text with a decimal keypad, not type="number": a pt-BR reader
                  types "2,5", and a number input drops what it cannot parse. */}
              <Input
                label={t.toleranceLabel}
                hint={tolerance === "invalid" ? undefined : t.toleranceHint}
                error={tolerance === "invalid" ? t.toleranceInvalid : undefined}
                className="max-w-xs tabular-nums"
                inputMode="decimal"
                value={toleranceText}
                onChange={(event) => changeTolerance(event.target.value)}
              />
              <div className="flex flex-col gap-3">
                {basis.map((slug) => {
                  const name = nameOf(slug);
                  return (
                    <div
                      key={slug}
                      className="grid gap-2 sm:grid-cols-[1fr_8rem_14rem] sm:items-end"
                    >
                      <span className="text-sm text-ink">{name}</span>
                      <Select
                        label={t.weightLabel(name)}
                        value={String(settings.weights[slug] ?? 1)}
                        onChange={(event) =>
                          setWeight(slug, Number(event.target.value))
                        }
                      >
                        {WEIGHT_OPTIONS.map((weight) => (
                          <SelectOption key={weight} value={String(weight)}>
                            {t.weightOption(formatNumber(weight))}
                          </SelectOption>
                        ))}
                      </Select>
                      <Select
                        label={t.criterionLabel(name)}
                        value={settings.criteria[slug] ?? "both"}
                        onChange={(event) =>
                          setCriterion(
                            slug,
                            event.target.value as NearnessCriterion,
                          )
                        }
                      >
                        <SelectOption value="both">
                          {t.criterionBoth}
                        </SelectOption>
                        <SelectOption value="at_most">
                          {t.criterionAtMost}
                        </SelectOption>
                        <SelectOption value="at_least">
                          {t.criterionAtLeast}
                        </SelectOption>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={
                basis.length === 0 ||
                search.isPending ||
                tolerance === "invalid"
              }
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
              <NamedList
                title={t.basisUsed}
                hint={t.distanceHint}
                items={result.basis_labels}
              />

              {result.tolerance_pct !== null && (
                <ToleranceSummary result={result} pct={result.tolerance_pct} />
              )}

              {result.neighbours.length === 0 ? (
                <EmptyState title={t.empty} description={t.excludedHint} />
              ) : (
                <ol className="flex flex-col gap-2">
                  {result.neighbours.map((neighbour) => (
                    <li key={neighbour.record_id}>
                      <Card>
                        <CardBody className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="text-xs text-ink-muted">
                                {neighbour.rank}.
                              </span>
                              <Link
                                href={`/app/materiais/${neighbour.record_id}`}
                                className="text-[0.9375rem] font-semibold text-brand-700"
                              >
                                {neighbour.name}
                              </Link>
                              {neighbour.is_own_record && (
                                <Badge tone="info">
                                  {ptBR.myRecords.ownBadge}
                                </Badge>
                              )}
                            </span>
                            <span className="text-xs text-ink-muted">
                              {t.distance}: {formatNumber(neighbour.distance)}
                            </span>
                          </div>
                          {neighbour.tolerance_matches !== null && (
                            <span className="text-xs text-ink">
                              {t.toleranceSummary(
                                neighbour.tolerance_matches,
                                applicableCount(result),
                              )}
                            </span>
                          )}
                          {/* Why this position: each property's weighted share (D-120). */}
                          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                            <dt className="sr-only">{t.contributionsTitle}</dt>
                            {result.basis.map((slug, index) => {
                              const share = neighbour.contributions[slug];
                              // Every neighbour carries the whole basis; a missing
                              // entry is skipped, never drawn as 0 (D-24).
                              if (share === undefined) return null;
                              return (
                                <dd key={slug}>
                                  {result.basis_labels[index] ?? slug}:{" "}
                                  {formatNumber(share)}
                                  {neighbour.satisfied.includes(slug) && (
                                    <>
                                      {" "}
                                      <Badge tone="success">
                                        {t.satisfiedTag}
                                      </Badge>
                                    </>
                                  )}
                                  {neighbour.within_tolerance.includes(
                                    slug,
                                  ) && (
                                    <>
                                      {" "}
                                      <Badge tone="success">
                                        {t.toleranceInside}
                                      </Badge>
                                    </>
                                  )}
                                </dd>
                              );
                            })}
                          </dl>
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
                  <span className="text-xs font-medium text-ink">
                    {t.excludedTitle}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {t.excludedHint}
                  </span>
                  <ul className="flex flex-col gap-1">
                    {result.excluded.map((item) => (
                      <li
                        key={item.record_id}
                        className="text-xs text-ink-muted"
                      >
                        {item.name} — {t.excludedMissing}{" "}
                        {item.missing_labels.join(", ")}
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

/** Basis properties that got a band: the denominator of "x de N". */
function applicableCount(result: Similar): number {
  return result.tolerance_bands.filter((band) => band.applicable).length;
}

/**
 * The bands that ran and, as a table, who falls inside each one (D-155).
 *
 * Every state is written — "Dentro da faixa", "Fora da faixa", "Sem faixa" —
 * never a colour alone, and the table is the textual source of the badges on
 * the cards (D-31). A record without a value never reaches this table: it was
 * excluded before any band was read, and the exclusion list says why (D-24).
 */
function ToleranceSummary({ result, pct }: { result: Similar; pct: number }) {
  return (
    <div className="subsection flex flex-col gap-2">
      <span className="text-xs font-medium text-ink">
        {t.toleranceTitle(formatNumber(pct))}
      </span>
      <ul className="flex flex-col gap-1 text-xs text-ink-muted">
        {result.tolerance_bands.map((band) => (
          <li key={band.slug}>
            {band.label}:{" "}
            {band.applicable && band.low !== null && band.high !== null
              ? t.toleranceBand(
                  formatNumber(band.low),
                  formatNumber(band.high),
                  band.unit,
                )
              : t.toleranceNotApplicable}
          </li>
        ))}
      </ul>
      {result.neighbours.length > 0 && (
        <TableScroll label={t.toleranceTableCaption}>
          <Table>
            <TableCaption>{t.toleranceTableCaption}</TableCaption>
            <THead>
              <Tr>
                <Th>{t.toleranceMaterialHeader}</Th>
                {result.tolerance_bands.map((band) => (
                  <Th key={band.slug}>{band.label}</Th>
                ))}
                <Th>{t.toleranceMatchesHeader}</Th>
              </Tr>
            </THead>
            <TBody>
              {result.neighbours.map((neighbour) => (
                <Tr key={neighbour.record_id}>
                  <RowHeader>{neighbour.name}</RowHeader>
                  {result.tolerance_bands.map((band) => (
                    <Td key={band.slug}>
                      {!band.applicable ? (
                        t.toleranceNoBand
                      ) : neighbour.within_tolerance.includes(band.slug) ? (
                        <Badge tone="success">{t.toleranceInside}</Badge>
                      ) : (
                        t.toleranceOutside
                      )}
                    </Td>
                  ))}
                  <Td numeric>
                    {neighbour.tolerance_matches === null
                      ? t.toleranceNoBand
                      : t.toleranceMatches(
                          neighbour.tolerance_matches,
                          applicableCount(result),
                        )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      )}
    </div>
  );
}
