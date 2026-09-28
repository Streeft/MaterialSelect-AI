import { describe, expect, it } from "vitest";

import {
  SHARED_VOICE_PITCH,
  SHARED_VOICE_RATE_FACTOR,
  pickVoices,
  toSegments,
  type VoiceLike,
} from "./voices";

const v = (name: string, lang: string, localService = true): VoiceLike => ({
  name,
  lang,
  localService,
  voiceURI: `uri:${name}`,
});

describe("pickVoices", () => {
  it("gives the two speakers two distinct pt-BR voices, local first, then by name", () => {
    const pick = pickVoices([
      v("Zeca", "pt-BR", true),
      v("Online A", "pt-BR", false),
      v("Ana", "pt_BR", true),
      v("Emma", "en-US", true),
    ]);
    expect(pick).not.toBeNull();
    expect(pick?.speakers.map((s) => s.voice.name)).toEqual(["Ana", "Zeca"]);
    expect(pick?.speakers.map((s) => s.pitch)).toEqual([1, 1]);
    expect(pick?.approximate).toBe(false);
    expect(pick?.sharedVoice).toBe(false);
  });

  it("is independent of the order the browser lists voices in", () => {
    const voices = [v("B", "pt-BR"), v("A", "pt-BR"), v("C", "pt-BR", false)];
    const names = (list: VoiceLike[]) =>
      pickVoices(list)?.speakers.map((s) => s.voice.name);
    expect(names(voices)).toEqual(names([...voices].reverse()));
  });

  it("matches the language tag case-insensitively and with an underscore", () => {
    expect(pickVoices([v("x", "PT_br")])?.approximate).toBe(false);
    expect(pickVoices([v("x", "pt-br")])?.approximate).toBe(false);
  });

  it("bends the only voice for speaker 2 so the two stay distinguishable", () => {
    const pick = pickVoices([v("Única", "pt-BR"), v("Emma", "en-US")]);
    expect(pick?.sharedVoice).toBe(true);
    const [one, two] = pick?.speakers ?? [];
    expect(one?.voice.name).toBe("Única");
    expect(two?.voice.name).toBe("Única");
    expect(one?.pitch).toBe(1);
    expect(two?.pitch).toBe(SHARED_VOICE_PITCH);
    expect(two?.rateFactor).toBe(SHARED_VOICE_RATE_FACTOR);
    expect(SHARED_VOICE_PITCH).toBe(0.8);
    expect(SHARED_VOICE_RATE_FACTOR).toBe(0.95);
  });

  it("does not count the same voice twice", () => {
    const same = v("Ana", "pt-BR");
    expect(pickVoices([same, { ...same }])?.sharedVoice).toBe(true);
  });

  it("falls back to another Portuguese variant and says it is approximate", () => {
    const pick = pickVoices([
      v("Joana", "pt-PT"),
      v("Emma", "en-US"),
      v("Pt", "pt"),
    ]);
    expect(pick?.approximate).toBe(true);
    expect(pick?.speakers.map((s) => s.voice.name)).toEqual(["Joana", "Pt"]);
  });

  it("prefers a single pt-BR voice over two approximate ones", () => {
    const pick = pickVoices([
      v("Joana", "pt-PT"),
      v("Rui", "pt-PT"),
      v("Ana", "pt-BR"),
    ]);
    expect(pick?.approximate).toBe(false);
    expect(pick?.sharedVoice).toBe(true);
  });

  it("returns null with no Portuguese voice at all", () => {
    expect(pickVoices([])).toBeNull();
    expect(
      pickVoices([v("Emma", "en-US"), v("Pierre", "fr-FR"), v("Pt?", "ptx")]),
    ).toBeNull();
  });
});

describe("toSegments", () => {
  it("splits a line into sentences, keeping line index, speaker and group", () => {
    const segments = toSegments([
      { speaker: 1, text: "Olá. Tudo bem? Sim!" },
      { speaker: 2, text: "Certo.", group: 3 },
    ]);
    expect(segments).toEqual([
      { text: "Olá.", lineIndex: 0, speaker: 1, group: null },
      { text: "Tudo bem?", lineIndex: 0, speaker: 1, group: null },
      { text: "Sim!", lineIndex: 0, speaker: 1, group: null },
      { text: "Certo.", lineIndex: 1, speaker: 2, group: 3 },
    ]);
  });

  it("never cuts decimal commas, thousands separators or digit groups", () => {
    const text =
      "O módulo é 3,5 GPa. A densidade é 1.200 kg/m³. O ciclo passa de 10 000 horas. Veja a Fig. 3 do texto.";
    const segments = toSegments([{ speaker: 1, text }]).map((s) => s.text);
    expect(segments).toEqual([
      "O módulo é 3,5 GPa.",
      "A densidade é 1.200 kg/m³.",
      "O ciclo passa de 10 000 horas.",
      "Veja a Fig. 3 do texto.",
    ]);
  });

  it("does not end a sentence at an abbreviation or before a lowercase word", () => {
    const segments = toSegments([
      { text: "Aços, alumínio etc. e polímeros. Segundo o Prof. Silva, sim." },
    ]).map((s) => s.text);
    expect(segments).toEqual([
      "Aços, alumínio etc. e polímeros.",
      "Segundo o Prof. Silva, sim.",
    ]);
  });

  it("keeps every segment within the limit, cutting at clauses then words", () => {
    const clause = "a liga de alumínio tem 2,7 g/cm³ de densidade";
    const text = Array.from({ length: 12 }, () => clause).join(", ") + ".";
    const segments = toSegments([{ text }], 60);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) expect(s.text.length).toBeLessThanOrEqual(60);
    // Nothing lost, nothing cut inside a number.
    expect(segments.map((s) => s.text).join(" ")).toBe(text);
    expect(
      segments.every((s) => !/2,$/.test(s.text) && !/^7 g/.test(s.text)),
    ).toBe(true);
  });

  it("splits a comma-free run on spaces without separating a digit group", () => {
    const words = "palavra ".repeat(10) + "10 000 " + "palavra ".repeat(10);
    const segments = toSegments([{ text: words.trim() }], 40).map(
      (s) => s.text,
    );
    for (const s of segments) expect(s.length).toBeLessThanOrEqual(40);
    expect(segments.some((s) => s.includes("10 000"))).toBe(true);
  });

  it("hard-cuts a single word longer than the limit", () => {
    const segments = toSegments([{ text: "x".repeat(25) }], 10);
    expect(segments.map((s) => s.text.length)).toEqual([10, 10, 5]);
  });

  it("uses 180 characters by default and yields nothing for a blank line", () => {
    const long = "palavra ".repeat(60).trim();
    const segments = toSegments([{ text: "   " }, { text: long }]);
    expect(segments.every((s) => s.text.length <= 180)).toBe(true);
    expect(segments.every((s) => s.lineIndex === 1)).toBe(true);
  });

  it("reads any speaker other than 2 as speaker 1", () => {
    const segments = toSegments([
      { speaker: 7, text: "a." },
      { speaker: null, text: "b." },
      { speaker: 2, text: "c." },
    ]);
    expect(segments.map((s) => s.speaker)).toEqual([1, 1, 2]);
  });
});
