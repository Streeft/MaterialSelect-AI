"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { pickVoices, type SpeechSegment, type VoicePick } from "./voices";

/**
 * Plays a segmented script with the browser's own voice (D-98).
 *
 * The Web Speech API is the least dependable thing the Studio touches, so the
 * hook leans on as little of it as possible:
 *
 * - **One utterance at a time.** Nothing is queued in the browser; `onend` of
 *   one segment speaks the next. Chrome drops long queues and long utterances.
 * - **Pause is `cancel()`.** Native `pause()`/`resume()` breaks on Android (it
 *   cancels) and when the tab is hidden, so pausing cancels and keeps the index,
 *   and resuming re-speaks the current segment from its start.
 * - **A generation token.** Every speak and every interruption bumps it, and an
 *   utterance's `onend`/`onerror` only act if their generation is still current.
 *   `cancel()` reports the interrupted utterance as ended or as an
 *   `interrupted`/`canceled` error, depending on the browser; neither may
 *   advance the player twice.
 * - **The live utterance is kept in a ref.** An unreferenced utterance can be
 *   garbage-collected before `onend` fires, which silently stalls the player.
 * - **`play()` speaks synchronously.** iOS Safari only lets the first `speak()`
 *   happen inside the user's gesture, so there is no `await` before it.
 */

export type SpeechStatus =
  | "unsupported"
  | "no-voice"
  | "idle"
  | "playing"
  | "paused"
  | "ended";

export interface UseSpeechOptions {
  /** From `toSegments`. Pass a memoised array: a new array resets the player. */
  segments: readonly SpeechSegment[];
  /** Initial speed (1 is the voice's normal pace). */
  rate?: number;
}

export interface SpeechPlayer {
  status: SpeechStatus;
  /** Index into `segments` of the current (or next to be spoken) segment. */
  index: number;
  /** `lineIndex` of the current segment (0 when there are no segments). */
  lineIndex: number;
  /** The current segment, for captions; null when there are none. */
  segment: SpeechSegment | null;
  rate: number;
  /** The voices in use; null while none is available. */
  voices: VoicePick<SpeechSynthesisVoice> | null;
  /** Error code from the engine (e.g. `not-allowed`, `synthesis-failed`) that paused playback. */
  error: string | null;
  /** Start (from the beginning after `ended`) or resume. Speaks synchronously. */
  play(): void;
  /** Stop speaking and keep the position. */
  pause(): void;
  /** Re-speak the current segment from its start. */
  resume(): void;
  /** Go to the first segment of the next line. */
  next(): void;
  /** Go to the first segment of the previous line (or restart the first line). */
  prev(): void;
  /** Go to the first segment of line `i` (or of the first later line that has text). */
  seekLine(i: number): void;
  /** Change speed; if playing, the current segment restarts at the new speed. */
  setRate(rate: number): void;
}

/**
 * Chrome returns no voices until `voiceschanged` fires; Safari may never fire it.
 * An empty list only becomes "this browser has no voice" after this long.
 */
export const VOICE_SETTLE_MS = 1500;

const MIN_RATE = 0.1;
const MAX_RATE = 10;

type Phase = "idle" | "playing" | "paused" | "ended";

interface Playback {
  phase: Phase;
  index: number;
}

interface VoiceSnapshot {
  supported: boolean;
  voices: readonly SpeechSynthesisVoice[];
}

const EMPTY_VOICES: readonly SpeechSynthesisVoice[] = [];
// On the server nothing is known yet; render the neutral "idle" rather than
// flashing "unsupported" at every browser that does support speech.
const SERVER_SNAPSHOT: VoiceSnapshot = {
  supported: true,
  voices: EMPTY_VOICES,
};
const UNSUPPORTED_SNAPSHOT: VoiceSnapshot = {
  supported: false,
  voices: EMPTY_VOICES,
};

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  if (!("speechSynthesis" in window) || !window.speechSynthesis) return null;
  if (typeof window.SpeechSynthesisUtterance !== "function") return null;
  return window.speechSynthesis;
}

// `getVoices()` returns a new array on every call; useSyncExternalStore needs
// the same object back while nothing changed, so snapshots are cached by content.
let cachedKey = "";
let cachedSnapshot: VoiceSnapshot = SERVER_SNAPSHOT;

function getVoiceSnapshot(): VoiceSnapshot {
  const synth = getSynth();
  if (!synth) return UNSUPPORTED_SNAPSHOT;
  const voices = synth.getVoices();
  const key = voices
    .map(
      (v) =>
        `${v.voiceURI}\u0000${v.name}\u0000${v.lang}\u0000${v.localService}`,
    )
    .join("\u0001");
  if (key !== cachedKey || cachedSnapshot === SERVER_SNAPSHOT) {
    cachedKey = key;
    cachedSnapshot = {
      supported: true,
      voices: voices.length ? voices : EMPTY_VOICES,
    };
  }
  return cachedSnapshot;
}

function getServerVoiceSnapshot(): VoiceSnapshot {
  return SERVER_SNAPSHOT;
}

function subscribeVoices(onChange: () => void): () => void {
  const synth = getSynth();
  if (!synth) return () => {};
  synth.addEventListener("voiceschanged", onChange);
  return () => synth.removeEventListener("voiceschanged", onChange);
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

function firstSegmentOfLine(
  segments: readonly SpeechSegment[],
  line: number,
): number {
  return segments.findIndex((s) => s.lineIndex >= line);
}

export function useSpeech({
  segments,
  rate: initialRate = 1,
}: UseSpeechOptions): SpeechPlayer {
  const snapshot = useSyncExternalStore(
    subscribeVoices,
    getVoiceSnapshot,
    getServerVoiceSnapshot,
  );
  const voices = useMemo(() => pickVoices(snapshot.voices), [snapshot.voices]);

  const [settledByTime, setSettledByTime] = useState(false);
  const [playback, setPlayback] = useState<Playback>({
    phase: "idle",
    index: 0,
  });
  const [rate, setRateState] = useState(() => clampRate(initialRate));
  const [error, setError] = useState<string | null>(null);

  // A new script is a new player: back to the start, adjusted during render
  // (the speech itself is silenced by the effect cleanup below).
  const [shownSegments, setShownSegments] = useState(segments);
  if (shownSegments !== segments) {
    setShownSegments(segments);
    setPlayback({ phase: "idle", index: 0 });
    setError(null);
  }

  const generationRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Latest values for the utterance callbacks, which outlive the render that made them.
  const segmentsRef = useRef(segments);
  const voicesRef = useRef(voices);
  const rateRef = useRef(rate);
  useEffect(() => {
    segmentsRef.current = segments;
    voicesRef.current = voices;
    rateRef.current = rate;
  });

  /** Invalidate any live utterance and stop the engine. */
  const silence = useCallback(() => {
    generationRef.current += 1;
    const hadUtterance = utteranceRef.current !== null;
    utteranceRef.current = null;
    const synth = getSynth();
    if (synth && (hadUtterance || synth.speaking || synth.pending))
      synth.cancel();
  }, []);

  // Depends only on refs and the stable `silence`, so the copy an utterance's
  // `onend` closed over is as current as any later one; it chains to itself.
  const speakAt = useCallback(
    function speak(
      index: number,
      pick: VoicePick<SpeechSynthesisVoice> | null,
      list: readonly SpeechSegment[],
    ): boolean {
      const synth = getSynth();
      const segment = list[index];
      if (!synth || !segment || !pick) return false;
      silence();
      const generation = ++generationRef.current;
      const speaker =
        segment.speaker === 2 ? pick.speakers[1] : pick.speakers[0];
      const utterance = new SpeechSynthesisUtterance(segment.text);
      utterance.voice = speaker.voice;
      utterance.lang = speaker.voice.lang || "pt-BR";
      utterance.pitch = speaker.pitch;
      utterance.rate = clampRate(rateRef.current * speaker.rateFactor);
      utterance.onend = () => {
        if (generation !== generationRef.current) return;
        utteranceRef.current = null;
        const current = segmentsRef.current;
        const nextIndex = index + 1;
        if (
          nextIndex < current.length &&
          speak(nextIndex, voicesRef.current, current)
        ) {
          return;
        }
        setPlayback({
          phase: "ended",
          index: Math.min(index, Math.max(0, current.length - 1)),
        });
      };
      utterance.onerror = (event) => {
        if (generation !== generationRef.current) return;
        const code = (event as SpeechSynthesisErrorEvent).error;
        if (code === "interrupted" || code === "canceled") return;
        utteranceRef.current = null;
        generationRef.current += 1;
        setError(code || "synthesis-failed");
        setPlayback({ phase: "paused", index });
      };
      utteranceRef.current = utterance;
      synth.speak(utterance);
      setPlayback({ phase: "playing", index });
      return true;
    },
    [silence],
  );
  const currentVoices = useCallback(() => {
    if (voices) return voices;
    // Chrome may have loaded the voices without our render catching up yet.
    const synth = getSynth();
    return synth ? pickVoices(synth.getVoices()) : null;
  }, [voices]);

  const play = useCallback(() => {
    if (playback.phase === "playing") return;
    const start = playback.phase === "ended" ? 0 : playback.index;
    setError(null);
    speakAt(start, currentVoices(), segments);
  }, [playback, speakAt, currentVoices, segments]);

  const pause = useCallback(() => {
    if (playback.phase !== "playing") return;
    silence();
    setPlayback({ phase: "paused", index: playback.index });
  }, [playback, silence]);

  const resume = useCallback(() => {
    if (playback.phase === "paused") {
      setError(null);
      speakAt(playback.index, currentVoices(), segments);
    } else if (playback.phase !== "playing") {
      play();
    }
  }, [playback, speakAt, currentVoices, segments, play]);

  const jumpTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= segments.length) return;
      if (playback.phase === "playing") {
        if (speakAt(target, currentVoices(), segments)) return;
        silence();
      }
      // Without a voice the index still moves: the video player navigates by hand.
      const phase: Phase = playback.phase === "idle" ? "idle" : "paused";
      setPlayback({ phase, index: target });
    },
    [playback, segments, speakAt, currentVoices, silence],
  );

  const next = useCallback(() => {
    const line = segments[playback.index]?.lineIndex;
    if (line === undefined) return;
    const target = firstSegmentOfLine(segments, line + 1);
    if (target !== -1) {
      jumpTo(target);
    } else if (playback.phase === "playing") {
      silence();
      setPlayback({ phase: "ended", index: playback.index });
    }
  }, [segments, playback, jumpTo, silence]);

  const prev = useCallback(() => {
    const line = segments[playback.index]?.lineIndex;
    if (line === undefined) return;
    let previousLine = line;
    for (let i = playback.index - 1; i >= 0; i -= 1) {
      const candidate = segments[i];
      if (candidate && candidate.lineIndex < line) {
        previousLine = candidate.lineIndex;
        break;
      }
    }
    jumpTo(firstSegmentOfLine(segments, previousLine));
  }, [segments, playback, jumpTo]);

  const seekLine = useCallback(
    (line: number) => {
      jumpTo(firstSegmentOfLine(segments, line));
    },
    [segments, jumpTo],
  );

  const setRate = useCallback(
    (value: number) => {
      const next = clampRate(value);
      rateRef.current = next;
      setRateState(next);
      if (playback.phase === "playing")
        speakAt(playback.index, currentVoices(), segments);
    },
    [playback, speakAt, currentVoices, segments],
  );

  // Silence on a new script and on unmount.
  useEffect(() => silence, [segments, silence]);

  // An empty voice list only counts as "no voice" after a grace period.
  useEffect(() => {
    const timer = setTimeout(() => setSettledByTime(true), VOICE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Leaving the page (or entering the back-forward cache) must not keep talking.
  useEffect(() => {
    const onPageHide = () => {
      if (utteranceRef.current === null) return;
      silence();
      setPlayback((p) =>
        p.phase === "playing" ? { ...p, phase: "paused" } : p,
      );
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [silence]);

  let status: SpeechStatus;
  if (!snapshot.supported) status = "unsupported";
  else if (!voices)
    status = snapshot.voices.length > 0 || settledByTime ? "no-voice" : "idle";
  else status = playback.phase;

  const segment = segments[playback.index] ?? null;
  return {
    status,
    index: playback.index,
    lineIndex: segment?.lineIndex ?? 0,
    segment,
    rate,
    voices,
    error,
    play,
    pause,
    resume,
    next,
    prev,
    seekLine,
    setRate,
  };
}
