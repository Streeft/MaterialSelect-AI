import { describe, expect, it } from "vitest";
import { countLabel, formatDate, formatNumber, prettyUnit } from "./format";

describe("formatNumber", () => {
  it("renders zero plainly", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("uses pt-BR decimal separators in the ordinary range", () => {
    expect(formatNumber(2700)).toBe("2.700");
    expect(formatNumber(1.5)).toBe("1,5");
  });

  it("switches to scientific notation for large magnitudes", () => {
    expect(formatNumber(69e9)).toBe("6,9 × 10^10");
  });

  it("switches to scientific notation for very small magnitudes", () => {
    expect(formatNumber(0.00001)).toBe("1 × 10^-5");
  });

  it("keeps the sign of negative values", () => {
    expect(formatNumber(-2.5)).toBe("-2,5");
  });
});

describe("prettyUnit", () => {
  it("renders an absent unit as empty and dimensionless as a dash", () => {
    expect(prettyUnit(null)).toBe("");
    expect(prettyUnit("dimensionless")).toBe("—");
  });

  it("turns compact squares and cubes into superscripts", () => {
    expect(prettyUnit("kg/m**3")).toBe("kg/m³");
    expect(prettyUnit("m**2")).toBe("m²");
  });

  it("renders multiplication as a middle dot", () => {
    expect(prettyUnit("W/(m*K)")).toBe("W/(m·K)");
  });

  it("keeps fractional exponents readable instead of mangling them", () => {
    // Regression: an index dimensionality such as sqrt(Pa)/(kg/m**3) used to
    // render "** 2.5" as "·· 2.5" because ** fell through to the * rule.
    expect(prettyUnit("[length] ** 2.5 / [mass] ** 0.5 / [time]")).toBe(
      "[length]^2.5 / [mass]^0.5 / [time]",
    );
  });

  it("handles spaced squares and cubes in dimensionality strings", () => {
    expect(prettyUnit("[mass] * [length] / [time] ** 3 / [temperature]")).toBe(
      "[mass] · [length] / [time]³ / [temperature]",
    );
  });

  it("never leaves a double asterisk behind", () => {
    expect(prettyUnit("[length] ** 1.75")).not.toContain("*");
  });
});

describe("countLabel", () => {
  it("agrees with the number in front of it", () => {
    expect(countLabel(1, "restrição", "restrições")).toBe("1 restrição");
    expect(countLabel(2, "restrição", "restrições")).toBe("2 restrições");
  });

  it("treats none as plural, the way Portuguese does", () => {
    expect(countLabel(0, "critério", "critérios")).toBe("0 critérios");
  });
});

describe("formatDate", () => {
  it("renders an API timestamp in pt-BR order", () => {
    expect(formatDate("2026-03-14T10:00:00Z")).toBe("14/03/2026");
  });

  it("returns null for something that is not a date, never a placeholder", () => {
    // The caller decides what an unknown date looks like. A dash here would be
    // indistinguishable from a real absence in a column of real dates.
    expect(formatDate("nao é data")).toBeNull();
  });
});
