/**
 * A list of record ids as it travels in a link (D-187).
 *
 * The comparator takes the whole selection, so `?materiais=` can carry the
 * entire catalogue. Written one by one that is about 5 characters per id; here
 * an ascending run of consecutive ids is written as `a-b`, so the whole catalogue
 * is a handful of characters when it is contiguous and no worse than the plain
 * list when it is scattered. The order is kept (a ranking may carry meaning) and
 * a plain `1,2,3` link, the form every older link has, still reads back.
 */

/** Hard stop on how many ids one link can expand to, so `1-99999999` cannot allocate a catalogue's worth of nothing. */
export const MAX_LINK_IDS = 20000;

/** `[1,2,3,7,9,10]` as `1-3,7,9-10`. A run of two stays `a,b`: `a-b` would not be shorter. */
export function encodeIdList(ids: readonly number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < ids.length) {
    const start = ids[i] as number;
    let end = start;
    let j = i + 1;
    while (j < ids.length && (ids[j] as number) === end + 1) {
      end = ids[j] as number;
      j += 1;
    }
    if (end - start >= 2) parts.push(`${start}-${end}`);
    else for (let k = i; k < j; k += 1) parts.push(String(ids[k]));
    i = j;
  }
  return parts.join(",");
}

/** The ids a link carries, in order: positive integers only, ranges expanded, at most `MAX_LINK_IDS`. */
export function parseIdList(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const ids: number[] = [];
  for (const piece of raw.split(",")) {
    const text = piece.trim();
    const range = /^(\d+)-(\d+)$/.exec(text);
    if (range) {
      const from = Number.parseInt(range[1] as string, 10);
      const to = Number.parseInt(range[2] as string, 10);
      if (from < 1 || to < from) continue;
      for (let id = from; id <= to && ids.length < MAX_LINK_IDS; id += 1) ids.push(id);
    } else {
      const id = Number.parseInt(text, 10);
      if (Number.isInteger(id) && id > 0 && ids.length < MAX_LINK_IDS) ids.push(id);
    }
    if (ids.length >= MAX_LINK_IDS) break;
  }
  return ids;
}
