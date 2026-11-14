import { describe, expect, it } from "vitest";
import { notebookUrlSpec, rangeCodec } from "./urlState";

describe("rangeCodec (?trecho=, D-233)", () => {
  it("lê início-fim e escreve de volta", () => {
    expect(rangeCodec.parse("120-340")).toEqual({ start: 120, end: 340 });
    expect(rangeCodec.serialize({ start: 120, end: 340 })).toBe("120-340");
    expect(rangeCodec.serialize(null)).toBe("");
  });

  it.each(["", "120", "340-120", "5-5", "a-b", "-4-9", "1-2-3", "1.5-9", "12345678901-3", " 1-2"])(
    "um valor malformado (%j) cai no padrão",
    (raw) => {
      expect(rangeCodec.parse(raw)).toBeUndefined();
    },
  );

  it("o endereço do caderno tem o trecho, nulo por padrão", () => {
    expect(notebookUrlSpec.passage.param).toBe("trecho");
    expect(notebookUrlSpec.passage.defaultValue).toBeNull();
  });
});
