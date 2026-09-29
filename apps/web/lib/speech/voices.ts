/**
 * Pure helpers behind the Studio's audio and video players (D-98).
 *
 * Two jobs, neither of which touches `window`: choosing which of the browser's
 * voices reads each speaker, and cutting a script into pieces short enough that
 * the browser actually reads them to the end. Keeping them pure is what lets the
 * hook in `useSpeech.ts` stay a thin state machine, and lets both rules be tested
 * without a speech engine.
 */

/** The subset of `SpeechSynthesisVoice` the picker reads. */
export interface VoiceLike {
  readonly name: string;
  readonly lang: string;
  readonly localService: boolean;
  readonly voiceURI: string;
}

/** How one speaker is voiced: which voice, and how to bend it. */
export interface SpeakerVoice<V extends VoiceLike = VoiceLike> {
  readonly voice: V;
  /** Utterance pitch (the browser's default is 1). */
  readonly pitch: number;
  /** Multiplies the player's rate, so the listener's speed choice still applies. */
  readonly rateFactor: number;
}

export interface VoicePick<V extends VoiceLike = VoiceLike> {
  /** Index 0 reads speaker 1 (and anything that is not speaker 2); index 1 reads speaker 2. */
  readonly speakers: readonly [SpeakerVoice<V>, SpeakerVoice<V>];
  /**
   * True when no pt-BR voice exists and a voice from another Portuguese variant
   * (pt-PT, bare `pt`…) was chosen instead. The view says so in words: the
   * accent is not the one the script was written for.
   */
  readonly approximate: boolean;
  /**
   * True when only one suitable voice exists and speaker 2 is the same voice
   * with a lower pitch and a slightly slower rate — so the two can still be told
   * apart by ear.
   */
  readonly sharedVoice: boolean;
}

/** Pitch and rate bend applied to speaker 2 when it has to share speaker 1's voice. */
export const SHARED_VOICE_PITCH = 0.8;
export const SHARED_VOICE_RATE_FACTOR = 0.95;

function normalizedLang(lang: string): string {
  return lang.replace(/_/g, "-").toLowerCase();
}

function isBrazilian(voice: VoiceLike): boolean {
  return normalizedLang(voice.lang) === "pt-br";
}

function isPortuguese(voice: VoiceLike): boolean {
  const lang = normalizedLang(voice.lang);
  return lang === "pt" || lang.startsWith("pt-");
}

/**
 * Local voices first (they have no network round trip and are not subject to
 * the online voices' cut-off), then by name. Name order is by code point, not
 * `localeCompare`, so the choice cannot change with the machine's locale.
 */
function compareVoices(a: VoiceLike, b: VoiceLike): number {
  if (a.localService !== b.localService) return a.localService ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.voiceURI !== b.voiceURI) return a.voiceURI < b.voiceURI ? -1 : 1;
  return 0;
}

function distinctSorted<V extends VoiceLike>(voices: readonly V[]): V[] {
  const seen = new Set<string>();
  const out: V[] = [];
  for (const voice of [...voices].sort(compareVoices)) {
    const key = voice.voiceURI || voice.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(voice);
  }
  return out;
}

function pickFrom<V extends VoiceLike>(
  candidates: readonly V[],
  approximate: boolean,
): VoicePick<V> | null {
  const [first, second] = distinctSorted(candidates);
  if (!first) return null;
  const one: SpeakerVoice<V> = { voice: first, pitch: 1, rateFactor: 1 };
  if (second) {
    return {
      speakers: [one, { voice: second, pitch: 1, rateFactor: 1 }],
      approximate,
      sharedVoice: false,
    };
  }
  return {
    speakers: [
      one,
      {
        voice: first,
        pitch: SHARED_VOICE_PITCH,
        rateFactor: SHARED_VOICE_RATE_FACTOR,
      },
    ],
    approximate,
    sharedVoice: true,
  };
}

/**
 * Choose the voices for a two-speaker script.
 *
 * pt-BR (`pt-BR` or `pt_BR`, any case) first; failing that, any Portuguese voice
 * with `approximate: true`; failing that, `null` — the view then shows the
 * transcript with the D-24 sentence, never a player that would read Portuguese
 * in an English voice.
 */
export function pickVoices<V extends VoiceLike>(
  voices: readonly V[],
): VoicePick<V> | null {
  return (
    pickFrom(voices.filter(isBrazilian), false) ??
    pickFrom(voices.filter(isPortuguese), true)
  );
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

/** A script line as the players hand it over; extra fields are ignored. */
export interface SpeechLine {
  readonly text: string;
  /** 1 or 2; anything else is read by speaker 1. */
  readonly speaker?: number | null;
  /** Passed through untouched — the video player tags each narration with its scene. */
  readonly group?: number | null;
}

/** One utterance: a sentence (or a piece of a long one) of one line. */
export interface SpeechSegment {
  readonly text: string;
  /** Index of the line in the array given to `toSegments`. */
  readonly lineIndex: number;
  /** 1 or 2. */
  readonly speaker: 1 | 2;
  readonly group: number | null;
}

/**
 * Chrome stops an utterance after roughly 200–250 characters (about 15 s) without
 * an error, so no single utterance may be longer than this by default.
 */
export const DEFAULT_MAX_SEGMENT_CHARS = 180;

/**
 * Words that end in a period without ending the sentence. Lower-cased, without
 * the period. Short on purpose: a missed abbreviation costs a pause, a wrong
 * entry would glue two sentences together.
 */
const ABBREVIATIONS = new Set([
  "fig",
  "figs",
  "tab",
  "eq",
  "eqs",
  "ref",
  "refs",
  "cap",
  "sec",
  "vol",
  "ed",
  "p",
  "pp",
  "n",
  "nº",
  "no",
  "dr",
  "dra",
  "sr",
  "sra",
  "prof",
  "profa",
  "eng",
  "ex",
  "aprox",
  "etc",
  "al",
  "vs",
]);

/**
 * Sentence end: terminal punctuation, optional closing quote/bracket, then
 * whitespace. "1.200" and "3,5" have no whitespace after the mark, so they are
 * never candidates.
 */
const SENTENCE_END = /([.!?…]+)["'”’»)\]]*\s+/g;

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const marks = match[1] ?? "";
    const at = match.index ?? 0;
    const end = at + match[0].length;
    if (marks === ".") {
      const before = text.slice(start, at);
      const lastWord = before.match(/([\p{L}º]+)$/u)?.[1] ?? "";
      const afterChar = text.charAt(end);
      // "Fig. 3", "p. ex.", "etc. e mais": the next word is not a new sentence.
      if (
        ABBREVIATIONS.has(lastWord.toLowerCase()) ||
        /[\p{Ll}\p{N}]/u.test(afterChar)
      )
        continue;
      // A single capital before the period is an initial ("J. Silva").
      if (/^\p{Lu}$/u.test(lastWord)) continue;
    }
    sentences.push(text.slice(start, end).trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences.filter(Boolean);
}

/**
 * Words, with digit groups glued back together: "10 000" is one word here, so a
 * space-level cut can never leave "10" at the end of one utterance and "000" at
 * the start of the next.
 */
function wordsKeepingNumbers(text: string): string[] {
  const raw = text.split(/\s+/).filter(Boolean);
  const words: string[] = [];
  for (const word of raw) {
    const previous = words[words.length - 1];
    if (
      previous !== undefined &&
      /\d$/.test(previous) &&
      /^\d{3}(?!\d)/.test(word)
    ) {
      words[words.length - 1] = `${previous} ${word}`;
    } else {
      words.push(word);
    }
  }
  return words;
}

/** Greedily join pieces with a space while the result stays within `max`. */
function pack(pieces: readonly string[], max: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (!current) {
      current = piece;
    } else if (current.length + 1 + piece.length <= max) {
      current = `${current} ${piece}`;
    } else {
      out.push(current);
      current = piece;
    }
  }
  if (current) out.push(current);
  return out;
}

function hardCut(word: string, max: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
  return out;
}

function splitLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  // Clause marks followed by whitespace — so the comma in "3,5" is not one.
  const clauses = sentence.split(/(?<=[,;:—–])\s+/).filter(Boolean);
  const pieces: string[] = [];
  for (const clause of clauses) {
    if (clause.length <= max) {
      pieces.push(clause);
      continue;
    }
    for (const word of wordsKeepingNumbers(clause)) {
      if (word.length <= max) pieces.push(word);
      else pieces.push(...hardCut(word, max));
    }
  }
  return pack(pieces, max);
}

/**
 * Cut a script into utterances of at most `maxChars` characters.
 *
 * Each line is split into sentences; a sentence longer than the limit is split
 * at clause punctuation, then between words. Decimal commas, thousands
 * separators ("1.200", "10 000") and abbreviations like "Fig. 3" are never cut.
 * Short sentences are *not* merged: one sentence per utterance is also one
 * caption per screen in the video player. A line with no text yields no
 * segment.
 */
export function toSegments(
  lines: readonly SpeechLine[],
  maxChars: number = DEFAULT_MAX_SEGMENT_CHARS,
): SpeechSegment[] {
  const max = Math.max(1, Math.floor(maxChars));
  const segments: SpeechSegment[] = [];
  lines.forEach((line, lineIndex) => {
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!text) return;
    const speaker: 1 | 2 = line.speaker === 2 ? 2 : 1;
    const group = line.group ?? null;
    for (const sentence of splitSentences(text)) {
      for (const piece of splitLong(sentence, max)) {
        segments.push({ text: piece, lineIndex, speaker, group });
      }
    }
  });
  return segments;
}
