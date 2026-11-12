"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RunDiffRow, RunResult } from "@/lib/types";
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
  const [onlyChanges, setOnlyChanges] = useState(true);
  const diff = useQuery({
    queryKey: ["run-diff", runKey],
    queryFn: () => diffRuns({ before: entries(previous), after: entries(current) }),
    staleTime: Infinity,
  });

  return (
    <Section title={w.title} description={w.hint}>
      {diff.isPending ? (
        <LoadingState label={w.loading} />
      ) : diff.isError ? (
        <Alert tone="danger" role="alert">
          {describeApiError(diff.error, w.error)}
        </Alert>
      ) : (
        <div className="space-y-3">
          <p className="text-body text-ink">
            {diff.data.winner_changed
              ? w.winnerChanged(
                  diff.data.winners_before.join(" e ") || w.noWinner,
                  diff.data.winners_after.join(" e ") || w.noWinner,
                )
              : w.winnerSame(diff.data.winners_after.join(" e ") || w.noWinner)}
          </p>
          <p className="text-support text-ink-muted">
            {w.summary(diff.data.entered, diff.data.left, diff.data.moved)}
          </p>
          <Checkbox
            label={w.onlyChanges}
            checked={onlyChanges}
            onChange={(e) => setOnlyChanges(e.target.checked)}
          />
          {(() => {
            const rows = onlyChanges
              ? diff.data.rows.filter((r) => r.change !== "same" && r.change !== "unranked")
              : diff.data.rows;
            if (rows.length === 0) return <p className="text-support text-ink-muted">{w.nothingChanged}</p>;
            return (
              <TableScroll label={w.title}>
                <Table>
                  <THead>
                    <Tr>
                      <Th>{w.columnMaterial}</Th>
                      <Th numeric>{w.columnBefore}</Th>
                      <Th numeric>{w.columnAfter}</Th>
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
            );
          })()}
          <p className="text-caption text-ink-muted">{w.unavailableNote}</p>
        </div>
      )}
    </Section>
  );
}
