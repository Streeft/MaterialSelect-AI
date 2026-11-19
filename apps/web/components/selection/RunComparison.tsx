"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RunDiff, RunDiffRow, RunResult } from "@/lib/types";
import { diffRuns } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  Alert,
  Badge,
  Checkbox,
  LoadingState,
  RowHeader,
  Section,
  TBody,
  THead,
  Table,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { wizardText } from "@/lib/i18n-selection-wizard";

const w = wizardText.runs;

function entries(result: RunResult) {
  return result.candidates.map((c) => ({ record_id: c.record_id, name: c.name, rank: c.rank }));
}

function changeLabel(row: RunDiffRow): string {
  switch (row.change) {
    case "up":
      return w.change.up(row.positions ?? 0);
    case "down":
      return w.change.down(Math.abs(row.positions ?? 0));
    case "same":
      return w.change.same;
    case "entered":
      return w.change.entered;
    case "left":
      return w.change.left;
    case "unranked":
      return w.change.unranked;
  }
}

const TONE: Record<RunDiffRow["change"], "success" | "warning" | "neutral" | "info" | "danger"> = {
  up: "success",
  down: "warning",
  same: "neutral",
  entered: "info",
  left: "danger",
  unranked: "neutral",
};

/**
 * The current run against the previous one of the same study (D-210). The
 * rows — who entered, left, climbed or dropped, by how many positions — are
 * the backend's (`POST /selection/run-diff`); this only lays them out.
 *
 * `runKey` names the pair: a new run is a new key, so the comparison is asked
 * once per pair and never per render.
 */
export function RunComparison({
  previous,
  current,
  runKey,
}: {
  previous: RunResult;
  current: RunResult;
  runKey: number;
}) {
  const diff = useQuery({
    queryKey: ["run-diff", runKey],
    queryFn: () => diffRuns({ before: entries(previous), after: entries(current) }),
    staleTime: Infinity,
  });

  return (
    <Section title={w.title} description={w.hint}>
      <RunDiffBody
        diff={diff.data}
        pending={diff.isPending}
        error={diff.isError ? diff.error : null}
        afterLabel={w.columnAfter}
        note={w.unavailableNote}
      />
    </Section>
  );
}

/**
 * The comparison itself — winner sentence, counts and the row table — for any
 * pair the backend compared: two consecutive runs of a session (D-210) or two
 * runs kept in a study's history (D-245).
 */
export function RunDiffBody({
  diff,
  pending,
  error,
  afterLabel,
  note,
  tableLabel = w.title,
}: {
  diff: RunDiff | undefined;
  pending: boolean;
  error: unknown;
  /** The newer run's column: "Agora" for the session, "Depois" for the history. */
  afterLabel: string;
  /** A line under the table about where the pair came from, when there is one. */
  note?: string;
  /** The table's accessible name, so two comparisons on one page are told apart. */
  tableLabel?: string;
}) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  if (pending) return <LoadingState label={w.loading} />;
  if (error || !diff) {
    return (
      <Alert tone="danger" role="alert">
        {describeApiError(error, w.error)}
      </Alert>
    );
  }
  const rows = onlyChanges
    ? diff.rows.filter((r) => r.change !== "same" && r.change !== "unranked")
    : diff.rows;
  return (
    <div className="space-y-3">
      <p className="text-body text-ink">
        {diff.winner_changed
          ? w.winnerChanged(
              diff.winners_before.join(" e ") || w.noWinner,
              diff.winners_after.join(" e ") || w.noWinner,
            )
          : w.winnerSame(diff.winners_after.join(" e ") || w.noWinner)}
      </p>
      <p className="text-support text-ink-muted">{w.summary(diff.entered, diff.left, diff.moved)}</p>
      <Checkbox
        label={w.onlyChanges}
        checked={onlyChanges}
        onChange={(e) => setOnlyChanges(e.target.checked)}
      />
      {rows.length === 0 ? (
        <p className="text-support text-ink-muted">{w.nothingChanged}</p>
      ) : (
        <TableScroll label={tableLabel}>
          <Table>
            <THead>
              <Tr>
                <Th>{w.columnMaterial}</Th>
                <Th numeric>{w.columnBefore}</Th>
                <Th numeric>{afterLabel}</Th>
                <Th>{w.columnChange}</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.record_id}>
                  <RowHeader>{r.name}</RowHeader>
                  <Td numeric>{r.rank_before ?? "—"}</Td>
                  <Td numeric>{r.rank_after ?? "—"}</Td>
                  <Td>
                    <Badge tone={TONE[r.change]}>{changeLabel(r)}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      )}
      {note ? <p className="text-caption text-ink-muted">{note}</p> : null}
    </div>
  );
}
