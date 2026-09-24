import { describe, expect, it } from "vitest";
import {
  customizationsInUse,
  decodeMapState,
  encodeMapState,
  mapUsesCustomization,
  type MapUrlState,
} from "./url-state";

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

describe("customizationsInUse / mapUsesCustomization", () => {
  it("reads the default map as not customised", () => {
    expect(mapUsesCustomization(null)).toBe(false);
    expect(mapUsesCustomization({})).toBe(false);
    expect(
      mapUsesCustomization({
        universe: "material",
        scale: "log",
        envelopeShape: "ellipse",
        selectedClasses: [],
        showEnvelopes: true,
        showIntervals: true,
        showLabels: false,
        indexMode: "none",
        levelMaterialIds: [],
        numericLevels: [],
      }),
    ).toBe(false);
  });

  it("names every collapsed control that holds something", () => {
    expect(customizationsInUse(sample)).toEqual(["envelope", "classes", "layers", "index"]);
    expect(customizationsInUse({ universe: "process" })).toEqual(["universe"]);
    expect(customizationsInUse({ scale: "linear" })).toEqual(["scale"]);
    expect(customizationsInUse({ showLabels: true })).toEqual(["layers"]);
    expect(customizationsInUse({ indexMode: "viga-leve-rigidez" })).toEqual(["index"]);
  });

  it("leaves the axes out: they are never collapsed", () => {
    expect(
      mapUsesCustomization({
        xAxis: { mode: "index", property: "", indexSlug: "custom", customExpression: "a/b", goal: "maximize" },
      }),
    ).toBe(false);
  });
});
