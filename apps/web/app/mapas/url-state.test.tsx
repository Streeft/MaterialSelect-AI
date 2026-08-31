import { describe, expect, it } from "vitest";
import { decodeMapState, encodeMapState, type MapUrlState } from "./url-state";

const sample: MapUrlState = {
  xAxis: { mode: "property", property: "densidade", indexSlug: "", customExpression: "", goal: "maximize" },
  yAxis: { mode: "property", property: "modulo_young", indexSlug: "", customExpression: "", goal: "maximize" },
  scale: "log",
  envelopeShape: "hull",
  selectedClasses: ["metais", "ceramicas"],
  showEnvelopes: true,
  showIntervals: false,
  showLabels: false,
  indexMode: "none",
  customExpression: "",
  indexGoal: "maximize",
  levelMaterialIds: [],
  numericLevels: [1.5, 2.75],
};

describe("encodeMapState / decodeMapState", () => {
  it("round-trips full state, including non-ASCII", () => {
    const withAccent = { ...sample, customExpression: "densidade ± 5%" };
    const encoded = encodeMapState(withAccent);
    expect(decodeMapState(encoded)).toEqual(withAccent);
  });

  it("is URL-safe (no +, /, or = characters)", () => {
    const encoded = encodeMapState(sample);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("returns null for garbage input instead of throwing", () => {
    expect(decodeMapState("not-valid-base64!!!")).toBeNull();
  });
});
