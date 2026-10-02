import { describe, expect, it, vi } from "vitest";
import {
  catalogueExportUrl,
  opensInBrowser,
  readErrorDetail,
  studyExportUrl,
  studyLaudoUrl,
} from "./api";

describe("readErrorDetail", () => {
  it("keeps a string detail as the API wrote it", () => {
    expect(readErrorDetail("Material não encontrado.")).toBe("Material não encontrado.");
  });

  it("names the field of each validation entry of a 422", () => {
    expect(
      readErrorDetail([
        { type: "string_too_short", loc: ["body", "name"], msg: "String should have at least 1 character" },
        { type: "missing", loc: ["body", "class_id"], msg: "Field required" },
      ]),
    ).toBe("name: String should have at least 1 character; class_id: Field required");
  });

  it("returns null for a body it cannot read, so the caller's fallback wins", () => {
    expect(readErrorDetail(undefined)).toBeNull();
    expect(readErrorDetail([{ nope: true }])).toBeNull();
    expect(readErrorDetail({ detail: "nested" })).toBeNull();
  });
});

describe("convertMapBox", () => {
  it("posts the region to the backend's converter with the reader's unit choice", async () => {
    const { convertMapBox } = await import("./api");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          box: { x_min: 2000, x_max: null, y_min: null, y_max: null },
          x_unit: "kg/m**3",
          y_unit: "Pa",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const out = await convertMapBox(
        {
          x: "densidade",
          y: "modulo_young",
          to: "canonical",
          box: { x_min: 2, x_max: null, y_min: null, y_max: null },
        },
        { modulo_young: "MPa" },
      );
      expect(out.box.x_min).toBe(2000);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain("/api/charts/map-box?unidades=modulo_young%3AMPa");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toMatchObject({ to: "canonical", x: "densidade" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("export URLs", () => {
  it("builds export URLs for downloads and inline formats", () => {
    expect(opensInBrowser("html")).toBe(true);
    expect(opensInBrowser("csv")).toBe(false);
    expect(opensInBrowser("xlsx")).toBe(false);
    expect(opensInBrowser("docx")).toBe(false);
    expect(opensInBrowser("pptx")).toBe(false);

    expect(catalogueExportUrl("pptx")).toContain("/api/exports/catalogo.pptx");
    expect(studyExportUrl(42, "pptx")).toContain("/api/exports/estudos/42.pptx");
    expect(studyLaudoUrl(42, undefined, "pptx")).toContain("/api/exports/estudos/42/laudo.pptx");
    expect(studyLaudoUrl(42, "Eng. Carlos", "pptx")).toContain(
      "/api/exports/estudos/42/laudo.pptx?responsavel=Eng.+Carlos",
    );
  });
});

describe("compareEcoAudits", () => {
  it("posts comparison payload to /api/eco/comparar", async () => {
    const { compareEcoAudits } = await import("./api");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          material_a: { total_energy_mj: 100, total_carbon_kg: 10 },
          material_b: { total_energy_mj: 80, total_carbon_kg: 8 },
          delta_energy: -20,
          delta_energy_percent: -20,
          delta_carbon: -2,
          delta_carbon_percent: -20,
          winner_energy: "material_b",
          winner_carbon: "material_b",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const out = await compareEcoAudits({
        material_a: {
          material_id: 1,
          process_id: 1,
          part_mass: 2.5,
          recycled_fraction: 0,
          end_of_life: "landfill",
        },
        material_b: {
          material_id: 2,
          process_id: 2,
          part_mass: 2.0,
          recycled_fraction: 0.2,
          end_of_life: "recycle",
        },
        transport_mode: "truck_freight",
        transport_distance_km: 500,
        use: {
          model: "static",
          power_watts: 0,
          duty_cycle: 0,
          lifetime_years: 1,
          fuel_type: "electric",
          distance_km: 0,
          energy_intensity_mj_per_tonne_km: 0,
          electric_carbon_intensity_kg_per_kwh: 0.07,
        },
      });
      expect(out.winner_energy).toBe("material_b");
      expect(out.delta_energy).toBe(-20);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain("/api/eco/comparar");
      expect(init.method).toBe("POST");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
