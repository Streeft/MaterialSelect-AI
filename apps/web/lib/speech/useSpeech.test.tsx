import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installFakeSpeech,
  type FakeSpeechController,
} from "@/lib/testing/fakeSpeech";

import { VOICE_SETTLE_MS, useSpeech } from "./useSpeech";
import { toSegments, type SpeechSegment } from "./voices";

const PT_VOICES = [
  { name: "Ana", lang: "pt-BR" },
  { name: "Bruno", lang: "pt-BR" },
];

// Lines 0 and 2 have two sentences each: segments are
// 0 "A1." (l0) · 1 "A2." (l0) · 2 "B1." (l1) · 3 "C1." (l2) · 4 "C2." (l2)
const SEGMENTS: readonly SpeechSegment[] = toSegments([
  { speaker: 1, text: "A1. A2." },
  { speaker: 2, text: "B1." },
  { speaker: 1, text: "C1. C2." },
]);

let fake: FakeSpeechController | null = null;

function install(voices = PT_VOICES) {
  fake = installFakeSpeech({ voices });
  return fake;
}

afterEach(() => {
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
});

function spokenTexts(f: FakeSpeechController) {
  return f.spoken.map((u) => u.text);
}

describe("useSpeech", () => {
  it("is 'unsupported' without speechSynthesis", () => {
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    expect(result.current.status).toBe("unsupported");
    act(() => result.current.play());
    expect(result.current.status).toBe("unsupported");
  });

  it("is 'no-voice' once an empty list has settled, and 'idle' before that", () => {
    vi.useFakeTimers();
    install([]);
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    expect(result.current.status).toBe("idle");
    act(() => vi.advanceTimersByTime(VOICE_SETTLE_MS));
    expect(result.current.status).toBe("no-voice");
  });

  it("is 'no-voice' when the browser only has non-Portuguese voices", () => {
    install([{ name: "Emma", lang: "en-US" }]);
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    expect(result.current.status).toBe("no-voice");
  });

  it("picks up voices that arrive later through voiceschanged", () => {
    const f = install([]);
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    expect(result.current.voices).toBeNull();
    act(() => f.setVoices(PT_VOICES));
    expect(result.current.status).toBe("idle");
    expect(result.current.voices?.speakers[0].voice.name).toBe("Ana");
  });

  it("removes its voiceschanged listener on unmount", () => {
    install();
    const synth = window.speechSynthesis as unknown as {
      listenerCount: number;
    };
    const { unmount } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    expect(synth.listenerCount).toBe(1);
    unmount();
    expect(synth.listenerCount).toBe(0);
  });

  it("speaks synchronously inside play() and advances one utterance at a time on onend", () => {
    const f = install();
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));

    act(() => {
      result.current.play();
      // Still inside the "click": the utterance is already queued.
      expect(f.spoken).toHaveLength(1);
    });
    expect(result.current.status).toBe("playing");
    expect(result.current.index).toBe(0);
    expect(f.current()?.voice?.name).toBe("Ana");

    act(() => f.end());
    expect(result.current.index).toBe(1);
    expect(f.queue).toHaveLength(1);

    act(() => f.end());
    expect(result.current.index).toBe(2);
    expect(result.current.lineIndex).toBe(1);
    // Speaker 2 reads with the second voice.
    expect(f.current()?.voice?.name).toBe("Bruno");

    act(() => f.end());
    act(() => f.end());
    act(() => f.end());
    expect(result.current.status).toBe("ended");
    expect(result.current.index).toBe(4);
    expect(spokenTexts(f)).toEqual(["A1.", "A2.", "B1.", "C1.", "C2."]);

    // Playing again after the end starts over.
    act(() => result.current.play());
    expect(result.current.index).toBe(0);
    expect(result.current.status).toBe("playing");
  });

  it("bends the shared voice for speaker 2 when only one voice exists", () => {
    const f = install([{ name: "Ana", lang: "pt-BR" }]);
    const { result } = renderHook(() =>
      useSpeech({ segments: SEGMENTS, rate: 1 }),
    );
    act(() => result.current.seekLine(1));
    act(() => result.current.play());
    expect(f.current()?.voice?.name).toBe("Ana");
    expect(f.current()?.pitch).toBe(0.8);
    expect(f.current()?.rate).toBeCloseTo(0.95);
  });

  it("pauses with cancel() and resumes by re-speaking the same segment", () => {
    const f = install();
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    act(() => result.current.play());
    act(() => f.end());
    expect(result.current.index).toBe(1);

    act(() => result.current.pause());
    expect(result.current.status).toBe("paused");
    expect(result.current.index).toBe(1);
    expect(f.cancelCount).toBeGreaterThan(0);
    expect(f.queue).toHaveLength(0);

    act(() => result.current.resume());
    expect(result.current.status).toBe("playing");
    expect(spokenTexts(f)).toEqual(["A1.", "A2.", "A2."]);
  });

  it("play() while paused also resumes the current segment", () => {
    const f = install();
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    act(() => result.current.play());
    act(() => result.current.pause());
    act(() => result.current.play());
    expect(spokenTexts(f)).toEqual(["A1.", "A1."]);
  });

  it("ignores a stale onend or interruption error after next()", () => {
    const f = install();
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    act(() => result.current.play());
    const first = f.current();
    expect(first).not.toBeNull();

    act(() => result.current.next());
    expect(result.current.index).toBe(2);
    expect(result.current.status).toBe("playing");

    // The old utterance reports late, the way some engines do after cancel().
    act(() => {
      if (first) {
        f.fireEnd(first);
        f.fireError(first, "interrupted");
      }
    });
    expect(result.current.index).toBe(2);
    expect(result.current.status).toBe("playing");
    expect(spokenTexts(f)).toEqual(["A1.", "B1."]);
    expect(f.queue).toHaveLength(1);
  });

  it("moves by line with next/prev and seekLine", () => {
    install();
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    act(() => result.current.next());
    expect(result.current.index).toBe(2);
    expect(result.current.status).toBe("idle");
    act(() => result.current.next());
    expect(result.current.index).toBe(3);
    act(() => result.current.next());
    expect(result.current.index).toBe(3);
    act(() => result.current.prev());
    expect(result.current.index).toBe(2);
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => result.current.seekLine(2));
    expect(result.current.index).toBe(3);
    expect(result.current.segment?.text).toBe("C1.");
  });

  it("still navigates without a voice, for the manual video player", () => {
    install([{ name: "Emma", lang: "en-US" }]);
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    act(() => result.current.seekLine(2));
    expect(result.current.status).toBe("no-voice");
    expect(result.current.lineIndex).toBe(2);
  });

  it("playLine() seeks and speaks in the same call, from any state", () => {
    const f = install();
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));

    // Stopped: the first utterance is spoken inside the call (the user's tap).
    act(() => {
      result.current.playLine(2);
      expect(spokenTexts(f)).toEqual(["C1."]);
    });
    expect(result.current.status).toBe("playing");
    expect(result.current.index).toBe(3);

    // Playing: jumps and speaks the new line, one utterance queued.
    act(() => result.current.playLine(1));
    expect(spokenTexts(f)).toEqual(["C1.", "B1."]);
    expect(f.queue).toHaveLength(1);
    expect(result.current.lineIndex).toBe(1);

    // Paused: speaks again, and clears a previous engine error.
    act(() => f.error("not-allowed"));
    expect(result.current.error).toBe("not-allowed");
    act(() => result.current.playLine(0));
    expect(result.current.status).toBe("playing");
    expect(result.current.error).toBeNull();
    expect(result.current.index).toBe(0);

    // Ended: plays the asked line, not from the start.
    act(() => result.current.playLine(2));
    act(() => f.end());
    act(() => f.end());
    expect(result.current.status).toBe("ended");
    act(() => result.current.playLine(1));
    expect(result.current.status).toBe("playing");
    expect(f.current()?.text).toBe("B1.");
  });

  it("playLine() ignores a line past the end", () => {
    const f = install();
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    act(() => result.current.playLine(9));
    expect(result.current.status).toBe("idle");
    expect(result.current.index).toBe(0);
    expect(f.spoken).toHaveLength(0);
  });

  it("playLine() only moves without a voice", () => {
    install([{ name: "Emma", lang: "en-US" }]);
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    act(() => result.current.playLine(1));
    expect(result.current.status).toBe("no-voice");
    expect(result.current.lineIndex).toBe(1);
  });

  it("restarts the current segment at the new rate", () => {
    const f = install();
    const { result } = renderHook(() =>
      useSpeech({ segments: SEGMENTS, rate: 1 }),
    );
    act(() => result.current.play());
    act(() => result.current.setRate(1.5));
    expect(result.current.rate).toBe(1.5);
    expect(spokenTexts(f)).toEqual(["A1.", "A1."]);
    expect(f.current()?.rate).toBe(1.5);
    expect(f.queue).toHaveLength(1);

    // While paused, the rate only applies to the next speak.
    act(() => result.current.pause());
    act(() => result.current.setRate(0.75));
    expect(f.spoken).toHaveLength(2);
    act(() => result.current.resume());
    expect(f.current()?.rate).toBe(0.75);
  });

  it("pauses on a real engine error and reports it", () => {
    const f = install();
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    act(() => result.current.play());
    act(() => f.error("not-allowed"));
    expect(result.current.status).toBe("paused");
    expect(result.current.error).toBe("not-allowed");
    expect(result.current.index).toBe(0);
  });

  it("cancels on unmount", () => {
    const f = install();
    const { result, unmount } = renderHook(() =>
      useSpeech({ segments: SEGMENTS }),
    );
    act(() => result.current.play());
    const before = f.cancelCount;
    unmount();
    expect(f.cancelCount).toBe(before + 1);
    expect(f.queue).toHaveLength(0);
  });

  it("cancels and pauses on pagehide", () => {
    const f = install();
    const { result } = renderHook(() => useSpeech({ segments: SEGMENTS }));
    act(() => result.current.play());
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(result.current.status).toBe("paused");
    expect(f.queue).toHaveLength(0);
  });

  it("resets to the start, silenced, when the script changes", () => {
    const f = install();
    const { result, rerender } = renderHook(
      ({ segments }) => useSpeech({ segments }),
      {
        initialProps: { segments: SEGMENTS },
      },
    );
    act(() => result.current.play());
    act(() => f.end());
    const other = toSegments([{ text: "Outro." }]);
    rerender({ segments: other });
    expect(result.current.status).toBe("idle");
    expect(result.current.index).toBe(0);
    expect(f.queue).toHaveLength(0);
  });
});
