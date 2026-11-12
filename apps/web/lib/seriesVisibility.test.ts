import { describe, expect, it } from "vitest";
import { isolateSeries } from "./seriesVisibility";

describe("isolateSeries", () => {
  const keys = ["a", "b", "c"];

  it("hides every other series", () => {
    expect([...isolateSeries(keys, new Set(), "b")].sort()).toEqual(["a", "c"]);
  });

  it("restores every series when the series is already alone", () => {
    expect(isolateSeries(keys, new Set(["a", "c"]), "b").size).toBe(0);
  });

  it("isolating a hidden series shows it and hides the rest", () => {
    expect([...isolateSeries(keys, new Set(["b"]), "b")].sort()).toEqual(["a", "c"]);
  });
});
