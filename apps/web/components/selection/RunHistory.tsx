"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RunResult, SavedRun } from "@/lib/types";
import { compareStudyRuns, deleteStudyRun, keepStudyRun, listStudyRuns } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { formatDateTime, formatNumber } from "@/lib/format";
import { wizardText } from "@/lib/i18n-selection-wizard";
import { useUndoableDelete, withoutId } from "@/lib/useUndoableDelete";
import { useAnnounce } from "@/components/ui/Announcer";
import {
  Alert,
  Button,
  EmptyState,
  IconButton,
  Input,
  LoadingState,
  RowHeader,
  Section,
  Select,
  TBody,
  THead,
  Table,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { IconTrash } from "@/components/ui/icons";
import { RunDiffBody } from "./RunComparison";

const w = wizardText.history;

/** How a kept run is named on screen: the reader's label, or its date. */
export function versionName(run: SavedRun): string {
  return run.label ?? w.unnamed(formatDateTime(run.created_at) ?? String(run.id));
}

/**
 * A saved study's history (D-245): keep the run on screen as a named version,
 * list the kept ones, and compare any two. Keeping runs the *saved* study on
 * the server and stores what it answered; comparing reads two stored answers
 * (`diff_runs`, the same rule as the session comparison). No number is
 * computed here.
 */
export function RunHistory({
  studyId,
  studyName,
  onKept,
}: {
  studyId: number;
  studyName: string;
  /** The run the server just kept, to show as the current result. */
  onKept: (result: RunResult) => void;
}) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const undoableDelete = useUndoableDelete();
  const key = ["study-runs", studyId] as const;
  const runs = useQuery({ queryKey: key, queryFn: () => listStudyRuns(studyId) });
  const [label, setLabel] = useState("");
  const keep = useMutation({
    mutationFn: () => keepStudyRun(studyId, label),
    onSuccess: (data) => {
      setLabel("");
      void queryClient.invalidateQueries({ queryKey: key });
      announce(w.kept(versionName(data.run)));
      onKept(data.result);
    },
  });

  const list = runs.data ?? [];
  // The pair compared: chosen by the reader, or by default the two newest
  // (the older as "Antes"). Ids that no longer exist fall back to the default.
  const [picked, setPicked] = useState<{ before: number | null; after: number | null }>({
    before: null,
    after: null,
  });
  const has = (id: number | null) => id !== null && list.some((run) => run.id === id);
  const after = has(picked.after) ? picked.after : (list[0]?.id ?? null);
  const before = has(picked.before) ? picked.before : (list[1]?.id ?? null);
  const comparable = before !== null && after !== null && before !== after;
  const diff = useQuery({
    queryKey: ["study-runs-compare", studyId, before, after],
    queryFn: () => compareStudyRuns(studyId, before as number, after as number),
    enabled: comparable,
    staleTime: Infinity,
  });

  const remove = (run: SavedRun) =>
    undoableDelete({
      what: w.removed,
      hide: [{ queryKey: [...key], remove: withoutId(run.id) }],
      commit: () => deleteStudyRun(studyId, run.id),
    });

  return (
    <Section id="historico" title={w.title} description={w.hint(studyName)}>
      <div className="space-y-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            keep.mutate();
          }}
        >
          <div className="min-w-0 flex-1 basis-64">
            <Input
              label={w.labelField}
              placeholder={w.labelPlaceholder}
              maxLength={120}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" loading={keep.isPending}>
            {keep.isPending ? w.keeping : w.keep}
          </Button>
        </form>
        {keep.isError ? (
          <Alert tone="danger" role="alert">
            {describeApiError(keep.error, w.keepFailed)}
          </Alert>
        ) : null}

        {runs.isPending ? (
          <LoadingState label={w.loading} />
        ) : runs.isError ? (
          <Alert tone="danger" role="alert">
            {describeApiError(runs.error, w.loadFailed)}
          </Alert>
        ) : list.length === 0 ? (
          <EmptyState title={w.empty} />
        ) : (
          <TableScroll label={w.listLabel}>
            <Table>
              <THead>
                <Tr>
                  <Th>{w.columnVersion}</Th>
                  <Th numeric>{w.columnCandidates}</Th>
                  <Th>{w.columnWinner}</Th>
                  <Th>
                    <span className="sr-only">{w.actions}</span>
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {list.map((run) => (
                  <Tr key={run.id}>
                    <RowHeader>
                      <span className="block">{versionName(run)}</span>
                      {run.label ? (
                        <span className="block text-caption text-ink-muted">
                          {formatDateTime(run.created_at)}
                        </span>
                      ) : null}
                    </RowHeader>
                    <Td numeric>
                      {w.candidates(formatNumber(run.final_count), formatNumber(run.initial_count))}
                    </Td>
                    <Td>{run.winner_names.join(" e ") || w.noWinner}</Td>
                    <Td>
                      <IconButton
                        label={w.remove(versionName(run))}
                        icon={<IconTrash className="h-4 w-4" />}
                        onClick={() => remove(run)}
                      />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        )}

        {list.length > 0 ? (
          <div className="subsection space-y-3">
            <h3 className="text-body font-semibold text-ink">{w.compareTitle}</h3>
            <p className="text-support text-ink-muted">{w.compareHint}</p>
            {list.length < 2 ? (
              <p className="text-support text-ink-muted">{w.needTwo}</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label={w.before}
                    value={before ?? ""}
                    onChange={(event) =>
                      setPicked({ before: Number(event.target.value), after })
                    }
                  >
                    {list.map((run) => (
                      <option key={run.id} value={run.id}>
                        {versionName(run)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label={w.after}
                    value={after ?? ""}
                    onChange={(event) =>
                      setPicked({ before, after: Number(event.target.value) })
                    }
                  >
                    {list.map((run) => (
                      <option key={run.id} value={run.id}>
                        {versionName(run)}
                      </option>
                    ))}
                  </Select>
                </div>
                {comparable ? (
                  <RunDiffBody
                    diff={diff.data}
                    pending={diff.isPending}
                    error={diff.isError ? diff.error : null}
                    afterLabel={w.after}
                    tableLabel={w.compareTitle}
                  />
                ) : (
                  <p className="text-support text-ink-muted">{w.sameRun}</p>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
