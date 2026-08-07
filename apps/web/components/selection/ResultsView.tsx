import type { Contribution, RunResult } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { OKABE_ITO } from "@/lib/design/palette";
import {
  Alert,
  Badge,
  ButtonLink,
  MissingValue,
  Section,
  TBody,
  THead,
  Table,
  TableScroll,
  Td,
  Th,
  RowHeader,
  Tr,
} from "@/components/ui";
import { LimitationNotice } from "@/components/LimitationNotice";

const t = ptBR.selection;

/**
 * Bar widths on this screen are proportions of numbers the backend already
 * computed — how many survived out of how many started, how much of a score
 * came from one criterion. Nothing here derives a new quantity; the ratio only
 * decides how wide an element is (ADR 0004).
 */
function percent(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

/** One stage of the elimination: a bar, what it kept, and what it dropped. */
function FunnelRow({
  label,
  remaining,
  initial,
  eliminated,
  tone = "brand",
}: {
  label: string;
  remaining: number;
  initial: number;
  eliminated: number | null;
  tone?: "brand" | "neutral";
}) {
  return (
    <li className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3">
      <span className="truncate text-xs text-ink-muted" title={label}>
        {label}
      </span>
      <span className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
        <span
          className={
            "block h-full rounded-full " + (tone === "brand" ? "bg-brand" : "bg-ink-subtle")
          }
          style={{ width: `${percent(remaining, initial)}%` }}
        />
      </span>
      <span className="text-xs tabular-nums text-ink">
        <strong>{remaining}</strong>
        {eliminated !== null && eliminated > 0 ? (
          <span className="ml-1.5 text-2xs font-normal text-ink-subtle">
            −{eliminated} {t.eliminated}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** The score broken into its criteria, as widths and as written numbers. */
function Contributions({
  contributions,
  score,
}: {
  contributions: Contribution[];
  score: number;
}) {
  if (contributions.length === 0) return null;
  return (
    <div className="mt-1.5 max-w-xs">
      <span className="flex h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        {contributions.map((c, i) => (
          <span
            key={c.key}
            className="block h-full"
            style={{
              width: `${percent(c.contribution, score)}%`,
              backgroundColor: OKABE_ITO[i % OKABE_ITO.length],
            }}
          />
        ))}
      </span>
      {/* The bar is decoration; this list is the encoding. Colour alone would
          put the whole breakdown in the channel that fails first (D-24). */}
      <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {contributions.map((c, i) => (
          <div key={c.key} className="flex items-baseline gap-1 text-2xs">
            <dt className="flex items-center gap-1 text-ink-muted">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: OKABE_ITO[i % OKABE_ITO.length] }}
              />
              {c.label}
            </dt>
            <dd
              className="tabular-nums text-ink-muted"
              title={`${t.weight} ${c.weight.toFixed(2)} × ${c.normalized.toFixed(2)}`}
            >
              {c.contribution.toFixed(3)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ResultsView({ result }: { result: RunResult }) {
  const { funnel, candidates, index, ranking } = result;
  const rankedById = new Map(ranking?.ranked.map((r) => [r.material_id, r]) ?? []);
  // Why an index came out undefined for a given material. The backend says so
  // per material, and an absence without its reason is just a hole in a table.
  const undefinedReasonById = new Map(
    index?.values
      .filter((v) => v.value === null)
      .map((v) => [v.material_id, v.undefined_reason] as const) ?? [],
  );

  // Carry the surviving candidates over to the visual surfaces. The top-ranked
  // material is highlighted on the map so the two views tell the same story.
  const candidateIds = candidates.map((c) => c.material_id).join(",");
  const topId = ranking?.ranked.find((r) => r.rank === 1)?.material_id;

  return (
    <div className="space-y-6">
      <Section
        title={t.funnel}
        description={t.funnelHint}
        actions={
          <span className="text-xs text-ink-muted">
            {t.candidates}: <strong className="text-brand-700">{result.final_count}</strong> {t.of}{" "}
            {result.initial_count}
          </span>
        }
      >
        <ol className="space-y-2">
          <FunnelRow
            label={t.initial}
            remaining={result.initial_count}
            initial={result.initial_count}
            eliminated={null}
            tone="neutral"
          />
          {funnel.map((step, i) => (
            <FunnelRow
              key={i}
              label={step.label}
              remaining={step.remaining}
              initial={result.initial_count}
              // What this stage removed, from the counts the backend sent.
              eliminated={(funnel[i - 1]?.remaining ?? result.initial_count) - step.remaining}
            />
          ))}
        </ol>
      </Section>

      {candidates.length === 0 && <Alert tone="warning">{t.emptyResults}</Alert>}

      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <ButtonLink
            href={`/mapas?materiais=${candidateIds}${topId ? `&destaque=${topId}` : ""}`}
            variant="secondary"
          >
            {t.viewOnMap}
          </ButtonLink>
          <ButtonLink href={`/comparar?materiais=${candidateIds}`} variant="secondary">
            {t.compareCandidates}
          </ButtonLink>
        </div>
      )}

      {/* Candidates + ranking */}
      {candidates.length > 0 && (
        <Section title={t.ranking} description={ranking ? t.contributionsHint : undefined}>
          <TableScroll label={t.ranking}>
            <Table>
              <THead>
                <Tr>
                  {ranking && <Th numeric>{t.rank}</Th>}
                  <Th>{ptBR.catalog.columnName}</Th>
                  <Th>{ptBR.catalog.columnClass}</Th>
                  {index && (
                    <Th numeric>
                      {t.indexValue}
                      {index.dimension && index.dimension !== "dimensionless" && (
                        <span className="ml-1 font-normal normal-case text-ink-subtle">
                          [{prettyUnit(index.dimension)}]
                        </span>
                      )}
                    </Th>
                  )}
                  {ranking && <Th>{t.score}</Th>}
                </Tr>
              </THead>
              <TBody>
                {candidates.map((c) => {
                  const ranked = rankedById.get(c.material_id);
                  const reason = undefinedReasonById.get(c.material_id);
                  return (
                    <Tr key={c.material_id} className={c.rank === 1 ? "bg-success-soft" : undefined}>
                      {ranking && (
                        <Td numeric className="font-semibold">
                          {c.rank ?? <MissingValue />}
                        </Td>
                      )}
                      <RowHeader className="text-brand-700">{c.name}</RowHeader>
                      <Td className="text-ink-muted">{c.class_name}</Td>
                      {index && (
                        <Td numeric>
                          {c.index_value === null ? (
                            <span className="inline-flex flex-col items-end gap-0.5">
                              <MissingValue />
                              {reason ? (
                                <span className="text-2xs font-normal text-ink-muted">
                                  {reason}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            formatNumber(c.index_value)
                          )}
                        </Td>
                      )}
                      {ranking && (
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-24 overflow-hidden rounded-full bg-surface-sunken">
                              <span
                                className="block h-full rounded-full bg-brand"
                                style={{ width: `${percent(c.score ?? 0, 1)}%` }}
                              />
                            </span>
                            <span className="tabular-nums text-ink-muted">
                              {c.score !== null ? c.score.toFixed(3) : <MissingValue />}
                            </span>
                          </div>
                          {ranked && ranked.score > 0 && (
                            <Contributions
                              contributions={ranked.contributions}
                              score={ranked.score}
                            />
                          )}
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </TableScroll>
        </Section>
      )}

      {/* Excluded for missing data */}
      {ranking && ranking.excluded.length > 0 && (
        <Alert tone="warning" title={t.excludedTitle}>
          <p className="mb-2">{t.excludedHint}</p>
          <ul className="space-y-1">
            {ranking.excluded.map((e) => (
              <li key={e.material_id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{e.name}</span>
                <MissingValue />
                <span className="text-2xs">
                  {t.missing}: {e.missing_labels.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Sensitivity */}
      {ranking && ranking.sensitivity.length > 0 && (
        <Section title={t.sensitivity} description={t.sensitivityHint}>
          <TableScroll label={t.sensitivity}>
            <Table>
              <THead>
                <Tr>
                  <Th>{t.scenario}</Th>
                  <Th>{t.topMaterial}</Th>
                  <Th>
                    <span className="sr-only">{t.changed}</span>
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {ranking.sensitivity.map((s, i) => (
                  <Tr key={i}>
                    <Td className="text-ink-muted">{s.description}</Td>
                    <Td>{s.top_material_name ?? <MissingValue />}</Td>
                    <Td>
                      <Badge tone={s.changed ? "warning" : "success"}>
                        {s.changed ? t.changed : t.unchanged}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        </Section>
      )}

      {/* Item 5 of the proposal: the notice belongs on the screen that produces
          a recommendation, not only on the file exported from it. */}
      <LimitationNotice />
    </div>
  );
}
