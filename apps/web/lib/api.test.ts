import { describe, expect, it, vi } from "vitest";
import { readErrorDetail } from "./api";

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
