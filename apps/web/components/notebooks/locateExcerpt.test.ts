import { describe, expect, it } from "vitest";
import { locateExcerpt, validPosition } from "./locateExcerpt";

describe("locateExcerpt (D-218)", () => {
  const content =
    "Introdução.\n\nO aço carbono tem densidade de 7850 kg/m³.\n\nO alumínio 6061 tem 2700 kg/m³.";

  it("finds a passage whose paragraph breaks became spaces", () => {
    const span = locateExcerpt(content, "O aço carbono tem densidade de 7850 kg/m³. O alumínio 6061 tem 2700 kg/m³.");
    expect(span).not.toBeNull();
    expect(content.slice(span!.start, span!.end)).toBe(
      "O aço carbono tem densidade de 7850 kg/m³.\n\nO alumínio 6061 tem 2700 kg/m³.",
    );
  });

  it("is not fooled by regex characters in the text", () => {
    const text = "Ensaio (a) [b] a+b=c? $5 ^2 \\ fim.";
    const span = locateExcerpt(text, "(a) [b] a+b=c? $5 ^2 \\ fim.");
    expect(span).toEqual({ start: 7, end: text.length });
  });

  it("falls back to the opening words when the tail does not match", () => {
    const long = "um dois três quatro cinco seis sete oito nove dez onze doze treze catorze";
    const span = locateExcerpt(long, "um dois três quatro cinco seis sete oito nove dez onze doze OUTRO FIM");
    expect(span).toEqual({ start: 0, end: "um dois três quatro cinco seis sete oito nove dez onze doze".length });
  });

  it("says null when the passage is not there, and never invents a position", () => {
    expect(locateExcerpt(content, "cobre com 8960 kg/m³")).toBeNull();
    expect(locateExcerpt(content, "   ")).toBeNull();
  });
});


describe("validPosition (D-233)", () => {
  it("aceita um intervalo inteiro, crescente e dentro do texto", () => {
    expect(validPosition({ start: 0, end: 10 }, 10)).toBe(true);
    expect(validPosition({ start: 3, end: 4 }, 10)).toBe(true);
  });

  it.each([
    [{ start: 5, end: 5 }],
    [{ start: 6, end: 5 }],
    [{ start: -1, end: 5 }],
    [{ start: 0, end: 11 }],
    [{ start: 0.5, end: 5 }],
    [{ start: 0, end: Number.NaN }],
  ])("recusa %j", (position) => {
    expect(validPosition(position, 10)).toBe(false);
  });
});
