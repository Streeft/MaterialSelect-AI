"use client";

import { useState, type ReactNode } from "react";
import type { Candidate, Contribution, RunResult } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, formatScore, prettyUnit } from "@/lib/format";
import { OKABE_ITO } from "@/lib/design/palette";
import {
  Alert,
  Badge,
  Bar,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  MissingValue,
  Section,
  TBody,
  THead,
  Table,
  TableScroll,
  Td,
  Th,
  RowHeader,
  Tabs,
  Tr,
  type TabItem,
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
      <Bar
        value={percent(remaining, initial) / 100}
        color={tone === "brand" ? "bg-brand" : "bg-ink-subtle"}
        className="h-2.5"
      />
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
    <div className="max-w-md">
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
              title={`${t.weight} ${formatScore(c.weight)} × ${formatScore(c.normalized)}`}
            >
              {formatScore(c.contribution, 3)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** One line of the provenance list, or nothing when there is nothing to say. */
function ProvenanceItem({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-edge-subtle py-2 last:border-b-0 sm:flex-row sm:gap-3">
      <dt className="text-xs font-medium text-ink-muted sm:w-56 sm:shrink-0">{term}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}


/**
 * Who won, read off numbers the backend already computed (D-85).
 *
 * Nothing here scores anything: a ranked run names its rank-1 rows (all of
 * them — a tie is a tie), an index-only run names the best defined index value
 * in the direction the index declares, and a run with neither names nobody and
 * says why. Choosing the largest of numbers the server produced is a
 * comparison, not a computation (ADR 0004).
 */
export type Winner =
  | {
      kind: "ranked";
      names: string[];
      score: number;
      method: string;
      contributions: Contribution[];
      indexValue: number | null;
    }
  | { kind: "index"; names: string[]; value: number; maximize: boolean }
  | { kind: "none"; reason: "no_candidates" | "no_objective" | "no_defined_index" };

export function winnerOf(result: RunResult): Winner {
  const { candidates, ranking, index } = result;
  if (candidates.length === 0) return { kind: "none", reason: "no_candidates" };
  const top = ranking?.ranked.filter((r) => r.rank === 1) ?? [];
  const first = top[0];
  if (ranking && first) {
    return {
      kind: "ranked",
      names: top.map((r) => r.name),
      score: first.score,
      method: ranking.method,
      contributions: first.contributions,
      indexValue: candidates.find((c) => c.record_id === first.record_id)?.index_value ?? null,
    };
  }
  if (index) {
    const defined = candidates.filter(
      (c): c is Candidate & { index_value: number } => c.index_value !== null,
    );
    if (defined.length === 0) return { kind: "none", reason: "no_defined_index" };
    const better = (a: number, b: number) => (index.goal === "minimize" ? a < b : a > b);
    const best = defined.reduce(
      (acc, c) => (better(c.index_value, acc) ? c.index_value : acc),
      defined[0]!.index_value,
    );
    return {
      kind: "index",
      names: defined.filter((c) => c.index_value === best).map((c) => c.name),
      value: best,
      maximize: index.goal !== "minimize",
    };
  }
  return { kind: "none", reason: "no_objective" };
}

function WinnerCard({ result, winner }: { result: RunResult; winner: Winner }) {
  const passed = t.winnerPassed(result.initial_count, result.final_count);
  if (winner.kind === "none") {
    return (
      <Card>
        <CardBody className="space-y-1">
          <h2 className="text-base font-semibold text-ink">{t.winnerNoneTitle}</h2>
          <p className="text-sm text-ink-muted">{t.winnerNone[winner.reason]}</p>
          <p className="text-xs text-ink-muted">{passed}</p>
        </CardBody>
      </Card>
    );
  }
  const title =
    winner.names.length > 1
      ? t.winnerTie(winner.names.join(" e "))
      : t.winnerTitle(winner.names[0] ?? "");
  // The criteria that weighed most, for display only: ordered, never recomputed.
  const heaviest =
    winner.kind === "ranked" && winner.method === "weighted_sum"
      ? [...winner.contributions].sort((a, b) => b.contribution - a.contribution).slice(0, 3)
      : [];
  return (
    <Card className="border-success">
      <CardBody className="space-y-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-success-fg">
          {t.winnerEyebrow}
        </p>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <ul className="space-y-1 text-sm text-ink-muted">
          {winner.kind === "ranked" && (
            <li>
              {winner.method === "topsis"
                ? t.winnerTopsis(formatScore(winner.score, 3))
                : winner.method === "promethee"
                  ? t.winnerPromethee(formatScore(winner.score, 3))
                  : t.winnerWeighted(formatScore(winner.score, 3))}
            </li>
          )}
          {heaviest.length > 0 && (
            <li>
              {t.winnerHeaviest}{" "}
              {heaviest.map((c, i) => (
                <span key={c.key} className="whitespace-nowrap">
                  {i > 0 ? " · " : ""}
                  {c.label} <span className="tabular-nums">{formatScore(c.contribution, 3)}</span>
                </span>
              ))}
            </li>
          )}
          {winner.kind === "ranked" && winner.indexValue !== null && result.index && (
            <li>{t.winnerIndexValue(result.index.name ?? t.customIndex, formatNumber(winner.indexValue))}</li>
          )}
          {winner.kind === "index" && (
            <li>
              {t.winnerByIndex(
                result.index?.name ?? t.customIndex,
                formatNumber(winner.value),
                winner.maximize,
              )}
            </li>
          )}
          <li>{passed}</li>
        </ul>
      </CardBody>
    </Card>
  );
}

/** The first five, as the backend ordered them — the rest is in "Ranking". */
function TopCandidates({
  result,
  undefinedReasonById,
}: {
  result: RunResult;
  undefinedReasonById: Map<number, string | null>;
}) {
  const { candidates, ranking, index } = result;
  const top = candidates.slice(0, 5);
  return (
    <TableScroll label={t.top5Title}>
      <Table>
        <THead>
          <Tr>
            {ranking && <Th numeric>{t.rank}</Th>}
            <Th>{ptBR.catalog.columnName}</Th>
            <Th>{ptBR.catalog.columnClass}</Th>
            {index && <Th numeric>{t.indexValue}</Th>}
            {ranking && <Th>{t.score}</Th>}
          </Tr>
        </THead>
        <TBody>
          {top.map((c) => {
            const reason = undefinedReasonById.get(c.record_id);
            return (
              <Tr key={c.record_id} className={c.rank === 1 ? "bg-success-soft" : undefined}>
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
                          <span className="text-2xs font-normal text-ink-muted">{reason}</span>
                        ) : null}
                      </span>
                    ) : (
                      formatNumber(c.index_value)
                    )}
                  </Td>
                )}
                {ranking && (
                  <Td>
                    <span className="tabular-nums text-ink-muted">
                      {c.score !== null ? formatScore(c.score, 3) : <MissingValue />}
                    </span>
                  </Td>
                )}
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableScroll>
  );
}

/** The tabs of the results screen (D-85), in reading order. */
export type ResultsTab = "resumo" | "ranking" | "eliminados" | "sensibilidade" | "origem";

/**
 * Where each old section address now lives. The blocks kept their ids, so a
 * link pasted before the tabs existed ("…#excluidos") still lands on the right
 * content: the hash chooses the tab, and the tab holds the block.
 */
const TAB_BY_HASH: Record<string, ResultsTab> = {
  resumo: "resumo",
  vencedor: "resumo",
  candidatos: "ranking",
  contribuicoes: "ranking",
  funil: "eliminados",
  excluidos: "eliminados",
  sensibilidade: "sensibilidade",
  proveniencia: "origem",
};

function tabFromHash(): ResultsTab | null {
  if (typeof window === "undefined") return null;
  return TAB_BY_HASH[window.location.hash.replace(/^#/, "")] ?? null;
}

/**
 * The run's answer, summary first (D-85): who won and why, the top five, then
 * everything else in tabs — the full ranking, what was eliminated, the
 * sensitivity check and where every number came from. Nothing that was on the
 * old six-block page is gone; it is one tab away instead of one long scroll.
 */
export function ResultsView({
  result,
  initialTab,
}: {
  result: RunResult;
  initialTab?: ResultsTab;
}) {
  const [tab, setTab] = useState<ResultsTab>(() => initialTab ?? tabFromHash() ?? "resumo");
  const { funnel, candidates, index, ranking } = result;
  // P0-1: the per-stage summary only appears when there is a pipeline to
  // summarise. For a single-stage study the funnel below already *is* the
  // pipeline, and a one-row table above it would say the same thing twice.
  const stages = result.stages.length > 1 ? result.stages : [];
  // Why an index came out undefined for a given material. The backend says so
  // per material, and an absence without its reason is just a hole in a table.
  const undefinedReasonById = new Map(
    index?.values
      .filter((v) => v.value === null)
      .map((v) => [v.record_id, v.undefined_reason] as const) ?? [],
  );

  // Carry the surviving candidates over to the visual surfaces. The top-ranked
  // material is highlighted on the map so the two views tell the same story.
  const candidateIds = candidates.map((c) => c.record_id).join(",");
  const topId = ranking?.ranked.find((r) => r.rank === 1)?.record_id;

  const withContributions = ranking?.ranked.filter((r) => r.contributions.length > 0) ?? [];
  // Weights are per criterion and identical across materials, so any ranked row
  // reports them; the first one that has a breakdown at all is enough.
  const weightRows = withContributions[0]?.contributions ?? [];

  const winner = winnerOf(result);

  const tabs: TabItem<ResultsTab>[] = [
    { id: "resumo", label: t.tabSummary },
    { id: "ranking", label: t.tabRanking, meta: candidates.length },
    { id: "eliminados", label: t.tabExcluded },
    { id: "sensibilidade", label: t.tabSensitivity },
    { id: "origem", label: t.tabProvenance },
  ];

  return (
    <div className="space-y-6">
      {/* The answer first: who won, and why — or, honestly, that nobody did. */}
      <WinnerCard result={result} winner={winner} />

      <Tabs label={t.resultsTabs} items={tabs} value={tab} onChange={setTab} panelClassName="pt-4">
        {tab === "resumo" && (
          <div className="space-y-5">
            {candidates.length === 0 ? (
              <Alert tone="warning">{t.emptyResults}</Alert>
            ) : (
              <>
                <TopCandidates result={result} undefinedReasonById={undefinedReasonById} />
      {candidates.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    <ButtonLink
                      href={`/app/mapas?materiais=${candidateIds}${topId ? `&destaque=${topId}` : ""}`}
                      variant="secondary"
                    >
                      {t.viewOnMap}
                    </ButtonLink>
                    <ButtonLink href={`/app/comparar?materiais=${candidateIds}`} variant="secondary">
                      {t.compareCandidates}
                    </ButtonLink>
                  </div>
                )}
              </>
            )}
            <p className="text-xs text-ink-muted">
              {t.funnelLine(result.initial_count, result.final_count)}
            </p>
          </div>
        )}

        {tab === "ranking" && (
          <div className="space-y-6">
            {candidates.length === 0 && <Alert tone="warning">{t.emptyResults}</Alert>}
      {/* Candidates + ranking */}
      {candidates.length > 0 && (
        <Section id="candidatos" title={ranking ? t.ranking : t.candidates}>
          <TableScroll label={ranking ? t.ranking : t.candidates}>
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
                  const reason = undefinedReasonById.get(c.record_id);
                  return (
                    <Tr key={c.record_id} className={c.rank === 1 ? "bg-success-soft" : undefined}>
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
                            <Bar value={c.score} className="h-2 w-24" />
                            <span className="tabular-nums text-ink-muted">
                              {c.score !== null ? formatScore(c.score, 3) : <MissingValue />}
                            </span>
                          </div>
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

      {/* Where each score came from. Its own block: inside the ranking table the
          breakdown competed with the ranking for the same glance, and it is the
          part someone actually argues about. */}
      {withContributions.length > 0 && (
        <Section id="contribuicoes" title={t.contributions} description={t.contributionsHint}>
          <ul className="space-y-3">
            {withContributions.map((r) => (
              <li key={r.record_id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-ink">{r.name}</span>
                  <span className="text-2xs tabular-nums text-ink-subtle">
                    {t.score}: {formatScore(r.score, 3)}
                  </span>
                </div>
                <Contributions contributions={r.contributions} score={r.score} />
              </li>
            ))}
          </ul>
        </Section>
      )}

          </div>
        )}

        {tab === "eliminados" && (
          <div className="space-y-6">
      <Section
        id="funil"
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

        {stages.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="mb-2 text-left text-xs text-ink-muted">
                {t.stagesHint}
              </caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="py-1 pr-3">{t.stagesTitle}</th>
                  <th className="py-1 pr-3">{t.stagePassedAlone}</th>
                  <th className="py-1 pr-3">{t.stageRemaining}</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage.position} className="border-t border-edge">
                    <td className="py-1 pr-3">
                      {stage.label || t.stageNumber(stage.position + 1, stage.kind)}
                      {!stage.enabled && (
                        <span className="ml-2 text-xs text-ink-muted">({t.stageDisabled})</span>
                      )}
                    </td>
                    <td className="py-1 pr-3 tabular-nums">{formatNumber(stage.passed)}</td>
                    <td className="py-1 pr-3 tabular-nums">{formatNumber(stage.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Excluded for missing data */}
      {ranking && ranking.excluded.length > 0 && (
        <Section id="excluidos" title={t.excludedTitle} description={t.excludedHint}>
          <Alert tone="warning">
            <ul className="space-y-1">
              {ranking.excluded.map((e) => (
                <li key={e.record_id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{e.name}</span>
                  <MissingValue />
                  <span className="text-2xs">
                    {t.missing}: {e.missing_labels.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </Alert>
        </Section>
      )}

          </div>
        )}

        {tab === "sensibilidade" && (
          <div className="space-y-6">
            {!(ranking && ranking.sensitivity.length > 0) && (
              <EmptyState title={t.sensitivityNone} />
            )}
      {/* Sensitivity */}
      {ranking && ranking.sensitivity.length > 0 && (
        <Section id="sensibilidade" title={t.sensitivity} description={t.sensitivityHint}>
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
                    <Td>{s.top_record_name ?? <MissingValue />}</Td>
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

          </div>
        )}

        {tab === "origem" && (
          <div className="space-y-6">
      {/* What produced these numbers. Everything here is echoed back from the
          run itself — nothing is recomputed, and nothing is filled in when the
          study did not use it. */}
      <Section id="proveniencia" title={t.provenanceTitle} description={t.provenanceHint}>
        <dl className="rounded-card border border-edge bg-surface-raised px-4 py-1">
          <ProvenanceItem term={t.provCombinator}>{result.combinator}</ProvenanceItem>
          <ProvenanceItem term={t.provConstraints}>
            {funnel.length === 0 ? (
              <span className="text-ink-muted">{t.noConstraints}</span>
            ) : (
              <ol className="list-decimal space-y-0.5 pl-4">
                {funnel.map((step, i) => (
                  <li key={i}>
                    {step.label}{" "}
                    <span className="tabular-nums text-ink-muted">→ {step.remaining}</span>
                  </li>
                ))}
              </ol>
            )}
          </ProvenanceItem>
          <ProvenanceItem term={t.provIndexExpression}>
            {index ? (
              <code className="text-xs">{index.expression}</code>
            ) : (
              <span className="text-ink-muted">{t.provNone}</span>
            )}
          </ProvenanceItem>
          {index && (
            <>
              <ProvenanceItem term={t.provIndexGoal}>
                {index.goal === "minimize" ? t.minimize : t.maximize}
              </ProvenanceItem>
              <ProvenanceItem term={t.provIndexDimension}>
                {prettyUnit(index.dimension)}
              </ProvenanceItem>
              <ProvenanceItem term={t.provIndexDefined}>
                <span className="tabular-nums">
                  {index.defined_count} {t.of} {index.defined_count + index.undefined_count}
                </span>
              </ProvenanceItem>
            </>
          )}
          <ProvenanceItem term={t.method}>
            {ranking ? (
              ranking.method === "topsis" ? (
                t.methodTopsis
              ) : ranking.method === "promethee" ? (
                t.methodPromethee
              ) : (
                t.methodWeightedSum
              )
            ) : (
              <span className="text-ink-muted">{t.provNone}</span>
            )}
          </ProvenanceItem>
          {/* Normalization is only a real, separate step for weighted_sum —
              TOPSIS and PROMETHEE II fix their own internally (see
              RankingIn's docstring on the backend and `ranking.normalization`
              there being the method's own name, not an actual normalization
              choice) — so this row would otherwise claim a normalization that
              was never applied. Mirrors the objective step's own
              `method === "weighted_sum"` gate on this same input. */}
          {ranking && ranking.method === "weighted_sum" && (
            <ProvenanceItem term={t.normalization}>
              {ranking.normalization === "vector" ? t.normVector : t.normMinmax}
            </ProvenanceItem>
          )}
          <ProvenanceItem term={t.provCriteria}>
            {!ranking ? (
              <span className="text-ink-muted">{t.provNone}</span>
            ) : weightRows.length > 0 ? (
              <ul className="space-y-0.5">
                {weightRows.map((c) => (
                  <li key={c.key}>
                    {c.label}{" "}
                    <span className="tabular-nums text-ink-muted">{formatScore(c.weight)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              // No breakdown to read the weights off (every score came out 0).
              // The keys the run received are still the honest answer.
              <span>{ranking.criteria.join(", ")}</span>
            )}
          </ProvenanceItem>
        </dl>
      </Section>

          </div>
        )}
      </Tabs>

      {/* Item 5 of the proposal: the notice belongs on the screen that produces
          a recommendation, not only on the file exported from it — outside the
          tabs, so no tab can be the one where it is missing. */}
      <LimitationNotice />
    </div>
  );
}
