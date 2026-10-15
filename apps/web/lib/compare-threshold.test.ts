import { describe, expect, it } from "vitest";
import { MAX_THRESHOLD_PCT, parseThreshold, thresholdParam } from "./compare-threshold";

describe("parseThreshold (D-128)", () => {
  it("aceita número positivo, com ponto ou vírgula", () => {
    expect(parseThreshold("10")).toBe(10);
    expect(parseThreshold("7.5")).toBe(7.5);
    expect(parseThreshold("7,5")).toBe(7.5);
    expect(parseThreshold(` ${MAX_THRESHOLD_PCT} `)).toBe(MAX_THRESHOLD_PCT);
  });

  it("descarta o que está fora da faixa, sem consertar", () => {
    for (const bad of ["0", "-5", "1000.1", "5000"]) {
      expect(parseThreshold(bad)).toBeNull();
    }
  });

  it("descarta o que não é número simples", () => {
    for (const bad of ["", "abc", "10%", "1e2", "Infinity", "NaN", "1,2,3", "+5", null, undefined]) {
      expect(parseThreshold(bad as string | null | undefined)).toBeNull();
    }
  });

  it("serializa de forma estável para a URL", () => {
    expect(thresholdParam(10)).toBe("10");
    expect(parseThreshold(thresholdParam(7.5))).toBe(7.5);
  });
});
