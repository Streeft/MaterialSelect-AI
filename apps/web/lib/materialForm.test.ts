import { describe, expect, it } from "vitest";
import {
  emptyValueRow,
  formSchema,
  parseKeywords,
  toApiValues,
  toNum,
  type ValueRow,
} from "./materialForm";

describe("toNum", () => {
  it("parses comma-decimal and scientific notation", () => {
    expect(toNum("2,5")).toBe(2.5);
    expect(toNum("1e3")).toBe(1000);
    expect(toNum("210")).toBe(210);
  });

  it("returns null for empty or invalid input", () => {
    expect(toNum("")).toBeNull();
    expect(toNum("   ")).toBeNull();
    expect(toNum("abc")).toBeNull();
  });
});

describe("parseKeywords", () => {
  it("splits, trims and drops empties", () => {
    expect(parseKeywords("a, b ,  c")).toEqual(["a", "b", "c"]);
    expect(parseKeywords("")).toEqual([]);
  });
});

describe("toApiValues", () => {
  it("maps a scalar row to value + unit, nulling interval fields", () => {
    const row: ValueRow = { ...emptyValueRow(), property_slug: "densidade", kind: "scalar", value: "2,7", unit: "g/cm**3" };
    const [out] = toApiValues([row]);
    expect(out).toMatchObject({
      property_slug: "densidade",
      kind: "scalar",
      value: 2.7,
      unit: "g/cm**3",
      value_min: null,
      value_max: null,
    });
  });

  it("maps a missing row to all-null numerics and null unit", () => {
    const row: ValueRow = { ...emptyValueRow(), property_slug: "condutividade_termica", kind: "missing", unit: "W/(m*K)" };
    const out = toApiValues([row])[0]!;
    expect(out.value).toBeNull();
    expect(out.value_min).toBeNull();
    expect(out.unit).toBeNull();
  });

  it("maps an interval row to min/max/typical", () => {
    const row: ValueRow = {
      ...emptyValueRow(),
      property_slug: "limite_escoamento",
      kind: "interval",
      value_min: "40",
      value_max: "60",
      value_typical: "48",
      unit: "MPa",
    };
    const [out] = toApiValues([row]);
    expect(out).toMatchObject({ value_min: 40, value_max: 60, value_typical: 48, value: null });
  });
});

describe("formSchema", () => {
  const base = { name: "X", class_id: "1", subclass: "", description: "", keywords: "", values: [] };

  it("rejects an empty name", () => {
    expect(formSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("rejects a missing class", () => {
    expect(formSchema.safeParse({ ...base, class_id: "" }).success).toBe(false);
  });

  it("rejects a scalar value without unit", () => {
    const values = [{ ...emptyValueRow(), property_slug: "densidade", kind: "scalar", value: "2.7", unit: "" }];
    expect(formSchema.safeParse({ ...base, values }).success).toBe(false);
  });

  it("accepts a valid payload", () => {
    const values = [{ ...emptyValueRow(), property_slug: "densidade", kind: "scalar", value: "2.7", unit: "g/cm**3" }];
    expect(formSchema.safeParse({ ...base, values }).success).toBe(true);
  });
});
