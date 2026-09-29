/**
 * A scriptable stand-in for the Web Speech synthesis API (D-98).
 *
 * jsdom has no `speechSynthesis`, and headless Chromium has one with no voices
 * at all, so neither can exercise the Studio's players. This fake records every
 * `speak()`/`cancel()`, keeps the browser's queue semantics (the head of the
 * queue is "speaking"), and lets the test decide when an utterance ends or
 * fails — or, with `autoEndMs`, ends each one on a timer, for end-to-end runs.
 *
 * `installFakeSpeech` is deliberately **self-contained** (no imports, no
 * module-level helpers): Playwright serialises a function passed to
 * `page.addInitScript(installFakeSpeech, options)` by its source text, so
 * anything it referenced from outside would be missing in the page. In the page
 * the controller is also reachable as `window.__fakeSpeech`.
 */

export interface FakeVoice {
  name: string;
  lang: string;
  localService: boolean;
  voiceURI: string;
  default: boolean;
}

export interface FakeSpeechOptions {
  /** Voices returned by `getVoices()`. Default: none. */
  voices?: Array<Partial<FakeVoice> & { name: string; lang: string }>;
  /** When set, every utterance ends by itself this many ms after it starts. */
  autoEndMs?: number;
}

/** What the fake records about one `speak()` call. */
export interface FakeUtterance {
  text: string;
  lang: string;
  voice: FakeVoice | null;
  pitch: number;
  rate: number;
  volume: number;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export interface FakeSpeechController {
  /** Every utterance ever passed to `speak()`, in order. */
  readonly spoken: FakeUtterance[];
  /** The browser queue: `queue[0]` is the one being spoken. */
  readonly queue: FakeUtterance[];
  /** How many times `cancel()` was called. */
  cancelCount: number;
  /** The utterance being spoken, if any. */
  current(): FakeUtterance | null;
  /** Finish the utterance being spoken (fires `onend`, starts the next queued one). */
  end(): void;
  /** Fail the utterance being spoken with the given error code. */
  error(code?: string): void;
  /** Fire `onend` on any utterance, even one no longer queued — to test stale events. */
  fireEnd(utterance: FakeUtterance): void;
  /** Fire `onerror` on any utterance, even one no longer queued. */
  fireError(utterance: FakeUtterance, code: string): void;
  /** Replace the voice list; dispatches `voiceschanged` unless `dispatch` is false. */
  setVoices(voices: FakeSpeechOptions["voices"], dispatch?: boolean): void;
  /** Restore whatever `window` had before. */
  uninstall(): void;
}

export function installFakeSpeech(
  options: FakeSpeechOptions = {},
): FakeSpeechController {
  type Handler = (event: Event) => void;
  const w = window as unknown as Record<string, unknown>;
  const previous = {
    synth: Object.getOwnPropertyDescriptor(w, "speechSynthesis"),
    utterance: Object.getOwnPropertyDescriptor(w, "SpeechSynthesisUtterance"),
  };

  const toVoice = (
    v: Partial<FakeVoice> & { name: string; lang: string },
  ): FakeVoice => ({
    name: v.name,
    lang: v.lang,
    localService: v.localService ?? true,
    voiceURI: v.voiceURI ?? v.name,
    default: v.default ?? false,
  });

  let voices: FakeVoice[] = (options.voices ?? []).map(toVoice);
  const listeners = new Set<Handler>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const started = new WeakSet<FakeUtterance>();

  class Utterance implements FakeUtterance {
    text: string;
    lang = "";
    voice: FakeVoice | null = null;
    pitch = 1;
    rate = 1;
    volume = 1;
    onstart: Handler | null = null;
    onend: Handler | null = null;
    onerror: Handler | null = null;
    constructor(text?: string) {
      this.text = text ?? "";
    }
  }

  const fire = (
    u: FakeUtterance,
    type: "start" | "end" | "error",
    code?: string,
  ) => {
    const event = new Event(type);
    Object.assign(event, { utterance: u, charIndex: 0, elapsedTime: 0 });
    if (code !== undefined) Object.assign(event, { error: code });
    const handler =
      type === "start" ? u.onstart : type === "end" ? u.onend : u.onerror;
    handler?.(event);
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const controller: FakeSpeechController = {
    spoken: [],
    queue: [],
    cancelCount: 0,
    current: () => controller.queue[0] ?? null,
    end: () => {
      const head = controller.queue.shift();
      clearTimer();
      if (!head) return;
      fire(head, "end");
      startHead();
    },
    error: (code = "synthesis-failed") => {
      const head = controller.queue.shift();
      clearTimer();
      if (!head) return;
      fire(head, "error", code);
      startHead();
    },
    fireEnd: (u) => fire(u, "end"),
    fireError: (u, code) => fire(u, "error", code),
    setVoices: (next, dispatch = true) => {
      voices = (next ?? []).map(toVoice);
      if (dispatch) {
        const event = new Event("voiceschanged");
        for (const listener of [...listeners]) listener(event);
        synth.onvoiceschanged?.(event);
      }
    },
    uninstall: () => {
      clearTimer();
      if (previous.synth)
        Object.defineProperty(w, "speechSynthesis", previous.synth);
      else delete w.speechSynthesis;
      if (previous.utterance) {
        Object.defineProperty(
          w,
          "SpeechSynthesisUtterance",
          previous.utterance,
        );
      } else {
        delete w.SpeechSynthesisUtterance;
      }
      delete w.__fakeSpeech;
    },
  };

  function startHead() {
    const head = controller.queue[0];
    if (!head || started.has(head)) return;
    started.add(head);
    fire(head, "start");
    if (options.autoEndMs !== undefined) {
      timer = setTimeout(() => controller.end(), options.autoEndMs);
    }
  }

  const synth = {
    onvoiceschanged: null as Handler | null,
    paused: false,
    get speaking() {
      return controller.queue.length > 0;
    },
    get pending() {
      return controller.queue.length > 1;
    },
    getVoices: () => voices.slice(),
    speak: (u: FakeUtterance) => {
      controller.spoken.push(u);
      controller.queue.push(u);
      if (controller.queue.length === 1) startHead();
    },
    cancel: () => {
      controller.cancelCount += 1;
      clearTimer();
      const dropped = controller.queue.splice(0);
      // Browsers report the one being spoken as interrupted and the queued ones as canceled.
      dropped.forEach((u, i) =>
        fire(u, "error", i === 0 ? "interrupted" : "canceled"),
      );
    },
    pause: () => {
      synth.paused = true;
    },
    resume: () => {
      synth.paused = false;
    },
    addEventListener: (type: string, listener: Handler) => {
      if (type === "voiceschanged") listeners.add(listener);
    },
    removeEventListener: (type: string, listener: Handler) => {
      if (type === "voiceschanged") listeners.delete(listener);
    },
    dispatchEvent: () => true,
    /** Test hook: how many `voiceschanged` listeners are attached. */
    get listenerCount() {
      return listeners.size;
    },
  };

  Object.defineProperty(w, "speechSynthesis", {
    configurable: true,
    value: synth,
  });
  Object.defineProperty(w, "SpeechSynthesisUtterance", {
    configurable: true,
    value: Utterance,
  });
  w.__fakeSpeech = controller;
  return controller;
}
