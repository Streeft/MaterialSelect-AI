/**
 * "Esvaziar o arquivo" in stages (D-249).
 *
 * The server deletes a bounded batch per request and says how many archived notebooks are left;
 * this repeats the call, each time expecting exactly what the last answer left, until none is. With
 * thousands of archived notebooks that is a handful of short requests with a progress line instead
 * of one request that may run out of time or memory, and a failure costs the batch it happened in,
 * never the ones already deleted (each batch is one transaction).
 *
 * A run stops in three ways, and the caller is told which:
 * - **done**: nothing is left;
 * - **stopped** by the person, between two batches: whole notebooks were deleted and the rest is
 *   still in the archive;
 * - **interrupted** by an error (the archive changed under the confirmation, the network): thrown
 *   as `EmptyArchiveInterrupted`, carrying how many were deleted before it and the original error.
 */

import type { EmptiedArchiveBatch } from "./api";

export interface EmptyArchiveResult {
  /** Notebooks deleted by this run. */
  deleted: number;
  /** What the person confirmed at the start. */
  total: number;
  /** True when the person stopped the run before the archive was empty. */
  stopped: boolean;
}

export class EmptyArchiveInterrupted extends Error {
  readonly deleted: number;
  readonly total: number;
  readonly original: unknown;

  constructor(original: unknown, deleted: number, total: number) {
    super(original instanceof Error ? original.message : "A limpeza do arquivo foi interrompida.");
    this.name = "EmptyArchiveInterrupted";
    this.original = original;
    this.deleted = deleted;
    this.total = total;
  }
}

/** A guard against a server that keeps answering "remaining" without deleting: never loop forever. */
const MAX_BATCHES = 10_000;

export async function emptyArchiveInBatches({
  expected,
  step,
  onProgress,
  shouldStop,
}: {
  /** The count the person confirmed. */
  expected: number;
  /** One batch (`emptyNotebookArchive`). */
  step: (expected: number) => Promise<EmptiedArchiveBatch>;
  onProgress?: (deleted: number, total: number) => void;
  /** Asked between batches, never in the middle of one. */
  shouldStop?: () => boolean;
}): Promise<EmptyArchiveResult> {
  let deleted = 0;
  let remaining = expected;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    let answer: EmptiedArchiveBatch;
    try {
      answer = await step(remaining);
    } catch (error) {
      throw new EmptyArchiveInterrupted(error, deleted, expected);
    }
    deleted += answer.deleted;
    // A server from before D-249 deleted the lot in one request and sent no `remaining`.
    remaining = answer.remaining ?? 0;
    onProgress?.(deleted, expected);
    if (remaining <= 0) return { deleted, total: expected, stopped: false };
    if (answer.deleted === 0) {
      // Something is left and the server deleted nothing: stop instead of asking again forever.
      throw new EmptyArchiveInterrupted(
        new Error("O servidor não apagou nenhum caderno nesta etapa."),
        deleted,
        expected,
      );
    }
    if (shouldStop?.()) return { deleted, total: expected, stopped: true };
  }
  throw new EmptyArchiveInterrupted(new Error("Etapas demais."), deleted, expected);
}
