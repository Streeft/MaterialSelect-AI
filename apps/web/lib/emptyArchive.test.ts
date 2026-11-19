import { describe, expect, it, vi } from "vitest";
import { EmptyArchiveInterrupted, emptyArchiveInBatches } from "./emptyArchive";

/** A fake server holding `count` archived notebooks, deleting `size` per batch like the real one. */
function server(count: number, size: number) {
  let left = count;
  const step = vi.fn(async (expected: number) => {
    if (expected !== left) throw new Error(`O arquivo mudou: a confirmação era de ${expected} e agora há ${left}.`);
    const deleted = Math.min(size, left);
    left -= deleted;
    return { deleted, remaining: left };
  });
  return { step, left: () => left, add: (n: number) => (left += n) };
}

describe("emptyArchiveInBatches (D-249)", () => {
  it("repeats the call with the count each answer left, until the archive is empty", async () => {
    const s = server(7, 3);
    const seen: Array<[number, number]> = [];
    const result = await emptyArchiveInBatches({
      expected: 7,
      step: s.step,
      onProgress: (deleted, total) => seen.push([deleted, total]),
    });
    expect(result).toEqual({ deleted: 7, total: 7, stopped: false });
    expect(s.step.mock.calls.map(([expected]) => expected)).toEqual([7, 4, 1]);
    expect(seen).toEqual([
      [3, 7],
      [6, 7],
      [7, 7],
    ]);
  });

  it("an archive that fits in one batch is one call, as before", async () => {
    const s = server(2, 50);
    expect(await emptyArchiveInBatches({ expected: 2, step: s.step })).toEqual({
      deleted: 2,
      total: 2,
      stopped: false,
    });
    expect(s.step).toHaveBeenCalledTimes(1);
  });

  it("a server from before D-249, which sends no `remaining`, is done after one call", async () => {
    const step = vi.fn().mockResolvedValue({ deleted: 5 });
    expect(await emptyArchiveInBatches({ expected: 5, step })).toMatchObject({ deleted: 5, stopped: false });
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("stops between two batches when the person asks, saying what was deleted", async () => {
    const s = server(10, 2);
    let stop = false;
    const result = await emptyArchiveInBatches({
      expected: 10,
      step: s.step,
      onProgress: (deleted) => {
        if (deleted >= 4) stop = true;
      },
      shouldStop: () => stop,
    });
    expect(result).toEqual({ deleted: 4, total: 10, stopped: true });
    expect(s.left()).toBe(6);
  });

  it("asking to stop during the last batch is not a stop: it was done", async () => {
    const s = server(4, 2);
    let stop = false;
    const result = await emptyArchiveInBatches({
      expected: 4,
      step: s.step,
      onProgress: () => (stop = true),
      shouldStop: () => stop,
    });
    // After the first batch two are left and the person had asked: stopped. (The last batch of a
    // run never asks.)
    expect(result.stopped).toBe(true);
    const done = server(2, 2);
    expect(await emptyArchiveInBatches({ expected: 2, step: done.step, shouldStop: () => true })).toMatchObject({
      stopped: false,
      deleted: 2,
    });
  });

  it("an error mid-way carries what was deleted before it and the original error", async () => {
    const s = server(9, 3);
    s.step.mockImplementationOnce(async (expected) => {
      s.add(0);
      return { deleted: 3, remaining: expected - 3 };
    });
    // The archive changes before the second batch: the real server answers 409 and deletes nothing.
    const interrupted = emptyArchiveInBatches({
      expected: 9,
      step: s.step,
      onProgress: (deleted) => {
        if (deleted === 3) s.add(1);
      },
    });
    await expect(interrupted).rejects.toBeInstanceOf(EmptyArchiveInterrupted);
    await interrupted.catch((error: EmptyArchiveInterrupted) => {
      expect(error.deleted).toBe(3);
      expect(error.total).toBe(9);
      expect(error.message).toMatch(/O arquivo mudou/);
      expect((error.original as Error).message).toMatch(/O arquivo mudou/);
    });
  });

  it("never loops forever on a server that deletes nothing and keeps saying some remain", async () => {
    const step = vi.fn().mockResolvedValue({ deleted: 0, remaining: 5 });
    const run = emptyArchiveInBatches({ expected: 5, step });
    await expect(run).rejects.toBeInstanceOf(EmptyArchiveInterrupted);
    expect(step).toHaveBeenCalledTimes(1);
  });
});
