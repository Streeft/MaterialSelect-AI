import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";
import type { MaterialDetail, PropertyValueOut } from "@/lib/types";
import { PropertyGroupCard } from "@/components/PropertyGroup";
import { useKeepOfflineSheet } from "@/components/material/useKeepOfflineSheet";
import {
  OFFLINE_SHEETS_KEY,
  OFFLINE_SHEETS_MAX,
  buildOfflineSheet,
  clearOfflineSheets,
  describeValue,
  isKeepable,
  readOfflineSheets,
  saveOfflineSheet,
} from "./offlineSheets";

function prop(over: Partial<PropertyValueOut> = {}): PropertyValueOut {
  return {
    property_slug: "densidade",
    property_name: "Densidade",
    symbol: "ρ",
    category: "FISICA",
    is_missing: false,
    is_interval: false,
    value_scalar: 7.85,
    value_min: null,
    value_max: null,
    value_typical: null,
    original_unit: "g/cm³",
    normalized_value: 7850,
    canonical_unit: "kg/m^3",
    conversion_method: "pint",
    uncertainty: null,
    measurement_condition: null,
    notes: null,
    data_quality: "MEDIDO",
    source_label: "Ficha do fornecedor",
    display_unit: "g/cm³",
    display_value: 7.85,
    display_min: null,
    display_max: null,
    display_typical: null,
    display_uncertainty: null,
    ...over,
  } as PropertyValueOut;
}

function material(over: Partial<MaterialDetail> = {}, props: PropertyValueOut[] = [prop()]): MaterialDetail {
  return {
    id: 7,
    name: "Aço Demo B",
    class_id: 1,
    class_name: "Metais",
    class_slug: "metais",
    subclass: "Aço estrutural",
    description: null,
    is_demo: true,
    is_active: true,
    is_own_record: false,
    keywords: [],
    property_groups: [{ category: "FISICA", properties: props }],
    processes: [],
    designations: [],
    composition: [],
    ...over,
  } as MaterialDetail;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("describeValue (D-152)", () => {
  const cases: Array<[string, PropertyValueOut]> = [
    ["a scalar", prop()],
    ["a scalar with uncertainty", prop({ display_uncertainty: 0.05 })],
    ["an interval", prop({ is_interval: true, display_value: null, display_min: 190, display_max: 210 })],
    ["an interval with its typical value", prop({ is_interval: true, display_value: null, display_min: 190, display_max: 210, display_typical: 200 })],
    ["a very large number", prop({ display_value: 2.1e11, display_unit: "Pa" })],
  ];

  it.each(cases)("writes %s exactly as the sheet renders it", (_name, p) => {
    const { container } = render(<PropertyGroupCard group={{ category: "FISICA", properties: [p] }} />);
    // The sheet spaces "±" and "(Típico…)" with margins, not characters: compare the text without spaces.
    const rendered = (container.querySelector("tbody td")?.textContent ?? "").replace(/\s+/g, "");
    expect(rendered).toContain(describeValue(p)!.replace(/\s+/g, ""));
  });

  it("is absence, never a number, when the row is missing or carries no value", () => {
    expect(describeValue(prop({ is_missing: true, display_value: null, value_scalar: null }))).toBeNull();
    expect(describeValue(prop({ display_value: null, value_scalar: null }))).toBeNull();
  });

  it("falls back to the record's own values when the reading values are absent", () => {
    expect(describeValue(prop({ display_value: null, display_unit: null }))).toBe("7,85 g/cm³");
  });
});

describe("buildOfflineSheet (D-152)", () => {
  it("keeps what the sheet showed, with quality and source, and the day it was read", () => {
    const sheet = buildOfflineSheet(material(), new Date("2026-10-20T14:30:00Z"));
    expect(sheet).toMatchObject({ id: 7, name: "Aço Demo B", className: "Metais", readAt: "2026-10-20T14:30:00.000Z" });
    expect(sheet.rows[0]).toMatchObject({ name: "Densidade", symbol: "ρ", value: "7,85 g/cm³", quality: "Medido", source: "Ficha do fornecedor" });
  });

  it("keeps absence as a stated state: no value, 'Ausente', no source, never a 0 or a dash", () => {
    const missing = prop({ is_missing: true, display_value: null, value_scalar: null, data_quality: undefined, source_label: "qualquer" });
    const row = buildOfflineSheet(material({}, [missing]), new Date()).rows[0]!;
    expect(row.value).toBeNull();
    expect(row.quality).toBe("Ausente");
    expect(row.source).toBeNull();
  });
});

describe("what may be kept", () => {
  it("refuses an own record, which is private to the account", () => {
    expect(isKeepable(material({ is_own_record: true }))).toBe(false);
    expect(isKeepable(material())).toBe(true);
  });
});

describe("storage (D-152)", () => {
  const sheet = (id: number, at = "2026-10-20T10:00:00.000Z") => buildOfflineSheet(material({ id, name: `M${id}` }), new Date(at));

  it("keeps the newest first and replaces an earlier read of the same material", () => {
    saveOfflineSheet(sheet(1, "2026-10-20T10:00:00.000Z"));
    saveOfflineSheet(sheet(2, "2026-10-20T11:00:00.000Z"));
    saveOfflineSheet(sheet(1, "2026-10-20T12:00:00.000Z"));
    const kept = readOfflineSheets();
    expect(kept.map((s) => s.id)).toEqual([1, 2]);
    expect(kept[0]!.readAt).toBe("2026-10-20T12:00:00.000Z");
  });

  it("keeps at most the most recent ones", () => {
    for (let i = 1; i <= OFFLINE_SHEETS_MAX + 3; i++) saveOfflineSheet(sheet(i));
    const kept = readOfflineSheets();
    expect(kept).toHaveLength(OFFLINE_SHEETS_MAX);
    expect(kept[0]!.id).toBe(OFFLINE_SHEETS_MAX + 3);
    expect(kept.some((s) => s.id === 1)).toBe(false);
  });

  it("reads nothing from corrupt or foreign data", () => {
    window.localStorage.setItem(OFFLINE_SHEETS_KEY, "{not json");
    expect(readOfflineSheets()).toEqual([]);
    window.localStorage.setItem(OFFLINE_SHEETS_KEY, JSON.stringify({ v: 99, sheets: [sheet(1)] }));
    expect(readOfflineSheets()).toEqual([]);
  });

  it("never throws when storage is unavailable or full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveOfflineSheet(sheet(1))).not.toThrow();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readOfflineSheets()).toEqual([]);
  });

  it("can be cleared", () => {
    saveOfflineSheet(sheet(1));
    clearOfflineSheets();
    expect(readOfflineSheets()).toEqual([]);
  });
});

describe("useKeepOfflineSheet (D-152)", () => {
  it("keeps what the server answered", () => {
    renderHook(() => useKeepOfflineSheet(material(), false));
    expect(readOfflineSheets().map((s) => s.id)).toEqual([7]);
  });

  it("does not keep a placeholder, the previous unit choice shown while a new one loads", () => {
    renderHook(() => useKeepOfflineSheet(material(), true));
    expect(readOfflineSheets()).toEqual([]);
  });

  it("does not keep an own record, nor nothing", () => {
    renderHook(() => useKeepOfflineSheet(material({ is_own_record: true }), false));
    renderHook(() => useKeepOfflineSheet(undefined, false));
    expect(readOfflineSheets()).toEqual([]);
  });
});
