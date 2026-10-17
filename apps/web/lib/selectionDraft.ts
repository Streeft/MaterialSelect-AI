/**
 * The Selection wizard's saved draft (D-138, after the Google Docs "Saved" pattern).
 *
 * A pristine wizard (serialized state equal to the one it opened with) is never
 * written; the page compares the two strings, so no field is guessed to be
 * "empty enough" and a half-filled stage is never lost.
 *
 * A draft is what the reader typed into the wizard, kept in this browser so a
 * closed tab, a crash or a stray Back does not cost them the study. It is NOT a
 * saved study: it never reaches the server, never ranks anything and never
 * becomes a result (principle 2). It is keyed by account, because a classroom
 * machine is shared and one student must not be offered another's text.
 *
 * Everything here is pure except `readDraft`/`writeDraft`/`clearDraft`, which
 * wrap storage in try/catch: private windows, blocked site data and a full
 * quota all throw, and the wizard must work without a draft.
 */

export const DRAFT_VERSION = 1;
export const DRAFT_PREFIX = "msai.selection.draft.";

/** The fields the wizard needs to rebuild itself; the page types them precisely. */
export interface DraftData {
  name: string;
  functionText: string;
  objectiveText: string;
  freeVariables: string;
  universe: string;
  stages: unknown[];
  indexMode: string;
  customExpression: string;
  indexGoal: string;
  indexConfirmed: boolean;
  criteria: unknown[];
  method: string;
  normalization: string;
  useAhp: boolean;
}

export interface Draft {
  v: typeof DRAFT_VERSION;
  savedAt: string;
  step: string;
  data: DraftData;
}

export function draftKey(userId: number | string): string {
  return `${DRAFT_PREFIX}${userId}`;
}

const STRING_FIELDS = [
  "name",
  "functionText",
  "objectiveText",
  "freeVariables",
  "universe",
  "indexMode",
  "customExpression",
  "indexGoal",
  "method",
  "normalization",
] as const;

/** Parse a stored draft; anything that is not exactly the current shape is `null`. */
export function parseDraft(text: string | null): Draft | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Partial<Draft>;
  if (d.v !== DRAFT_VERSION || typeof d.savedAt !== "string" || typeof d.step !== "string") return null;
  const data = d.data as Partial<DraftData> | undefined;
  if (typeof data !== "object" || data === null) return null;
  for (const f of STRING_FIELDS) if (typeof data[f] !== "string") return null;
  if (!Array.isArray(data.stages) || !Array.isArray(data.criteria)) return null;
  if (typeof data.indexConfirmed !== "boolean" || typeof data.useAhp !== "boolean") return null;
  return d as Draft;
}

/**
 * The editor ids (`row-12`, `criterion-3`…) restart from 0 on every page load.
 * A recovered draft brings ids from the earlier load, so the counters must jump
 * past the largest one or a new row would reuse a key. Returns that maximum.
 */
export function maxIdSuffix(text: string): number {
  let max = -1;
  for (const m of text.matchAll(/"[a-z]+-(\d+)"/g)) max = Math.max(max, Number(m[1]));
  return max;
}

export function serializeDraft(step: string, data: DraftData, now: Date = new Date()): string {
  const draft: Draft = { v: DRAFT_VERSION, savedAt: now.toISOString(), step, data };
  return JSON.stringify(draft);
}

export function readDraft(key: string): Draft | null {
  try {
    return parseDraft(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeDraft(key: string, text: string): boolean {
  try {
    window.localStorage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}
