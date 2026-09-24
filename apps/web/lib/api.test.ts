import { describe, expect, it } from "vitest";
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
