"use client";

import type { WeightsPreview } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, formatPercent, formatScore } from "@/lib/format";
import { describeTotal } from "@/lib/selection/weightsGate";
import {
  Alert,
  Badge,
  Button,
  RowHeader,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";

const t = ptBR.selection.weights;

/**
 * The weights of a ranking read as a budget against the limit of 1 (D-87),
 * with the top five they produce — both computed in the backend on every pause
 * in the typing. Nothing here adds, divides or rounds: the total, each share,
 * the suggestion and the scores arrive as numbers and are only printed.
 *
 * A blank weight is "sem peso", never 0, and a row without a usable weight has
 * no share rather than a share of zero (D-24).
 */
export function WeightBudget({
  preview,
  pending,
  failed,
  labelOf,
  onApplySuggestion,
  onUndo,
}: {
  preview: WeightsPreview | null;
  pending: boolean;
  failed: boolean;
  labelOf: (key: string | null) => string;
  onApplySuggestion: (weights: number[]) => void;
  onUndo: (() => void) | null;
}) {
  if (failed) {
    return <Alert tone="info">{t.unavailable}</Alert>;
  }
  if (!preview) {
    return (
      <p role="status" className="text-xs text-ink-muted">
        {t.checking}
      </p>
    );
  }
  const { budget } = preview;
  const suggestion = budget.suggestion;

  return (
    <section
      aria-labelledby="pesos-titulo"
      aria-busy={pending || undefined}
      className="flex flex-col gap-3 rounded-card border border-edge bg-surface-sunken p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="pesos-titulo" className="text-sm font-semibold text-ink">
          {t.title}
        </h3>
        <Badge tone="neutral">{t.limit}</Badge>
      </div>

      <p
        role="status"
        className={
          budget.status === "exceeds"
            ? "text-sm font-medium text-danger-fg"
            : budget.status === "complete"
              ? "text-sm font-medium text-success-fg"
              : "text-sm font-medium text-ink"
        }
      >
        {describeTotal(budget)}
      </p>

      {budget.rows.length > 0 && (
        <TableScroll label={t.tableLabel}>
          <Table>
            <TableCaption>{t.tableLabel}</TableCaption>
            <THead>
              <Tr>
                <Th scope="col">{t.columnCriterion}</Th>
                <Th scope="col">{t.columnWeight}</Th>
                <Th scope="col">{t.columnShare}</Th>
              </Tr>
            </THead>
            <TBody>
              {budget.rows.map((row) => (
                <Tr key={row.position}>
                  <RowHeader>
                    <span className="flex flex-col gap-0.5">
                      <span>{row.key ? labelOf(row.key) : t.noCriterion}</span>
                      {row.issue ? (
                        <span className="text-2xs font-normal text-danger-fg">
                          {t.issues[row.issue]}
                        </span>
                      ) : null}
                    </span>
                  </RowHeader>
                  <Td className="tabular-nums">
                    {row.weight === null ? (
                      <span className="text-ink-subtle">{t.noWeight}</span>
                    ) : (
                      formatNumber(row.weight)
                    )}
                  </Td>
                  <Td>
                    {row.share_percent === null ? (
                      <span className="text-ink-subtle">{t.noShare}</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="w-14 tabular-nums">
                          {formatPercent(row.share_percent)}
                        </span>
                        {/* The bar's width is the backend's percentage, drawn
                            as is — a picture of the number beside it. */}
                        <span
                          aria-hidden
                          className="h-2 w-24 overflow-hidden rounded-full bg-surface"
                        >
                          <span
                            className="block h-full rounded-full bg-brand"
                            style={{ width: `${Math.min(row.share_percent, 100)}%` }}
                          />
                        </span>
                      </span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      )}

      {(suggestion || onUndo) && (
        <div className="flex flex-wrap items-center gap-3">
          {suggestion ? (
            <>
              <Button size="sm" variant="primary" onClick={() => onApplySuggestion(suggestion.weights)}>
                {t.suggest[suggestion.kind]}
              </Button>
              <span className="text-2xs text-ink-muted">
                {t.suggestionValues(suggestion.weights.map((w) => formatNumber(w)).join(" · "))}
              </span>
            </>
          ) : null}
          {onUndo ? (
            <Button size="sm" variant="ghost" onClick={onUndo}>
              {t.undo}
            </Button>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-edge pt-3">
        <h3 className="text-sm font-semibold text-ink">{t.previewTitle}</h3>
        {preview.unavailable_message ? (
          <p className="text-xs text-ink-muted">{preview.unavailable_message}</p>
        ) : (
          <>
            <ol className="flex flex-col gap-1">
              {preview.top.map((item) => (
                <li
                  key={item.record_id}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                >
                  <span>
                    <span className="mr-2 tabular-nums text-ink-muted">{item.rank}.</span>
                    <span className="font-medium text-ink">{item.name}</span>
                    {item.class_name ? (
                      <span className="ml-2 text-2xs text-ink-subtle">{item.class_name}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-ink-muted">
                    {t.previewScore} {formatScore(item.score, 3)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-2xs text-ink-muted">
              {preview.constraints_applied
                ? t.previewConstrained(preview.candidate_count, preview.initial_count)
                : t.previewWholeCatalogue(preview.initial_count)}
            </p>
            {preview.renormalized ? (
              <p className="text-2xs text-ink-muted">{t.previewRenormalized}</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
