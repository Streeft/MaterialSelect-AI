import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type DraftData,
  clearDraft,
  draftKey,
  maxIdSuffix,
  parseDraft,
  readDraft,
  serializeDraft,
  writeDraft,
} from "./selectionDraft";

const data: DraftData = {
  name: "Viga leve",
  functionText: "Viga de bicicleta",
  objectiveText: "",
  freeVariables: "espessura",
  universe: "material",
  stages: [{ id: "stage-4", group: { id: "group-5", rows: [{ id: "row-12", property_slug: "densidade" }] } }],
  indexMode: "none",
  customExpression: "",
  indexGoal: "maximize",
  indexConfirmed: false,
  criteria: [{ id: "criterion-3", slug: "modulo", weight: "1" }],
  method: "weighted_sum",
  normalization: "minmax",
  useAhp: false,
};

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("selection draft (D-138)", () => {
  it("is keyed by account, so a shared machine never offers another student's text", () => {
    expect(draftKey(7)).not.toBe(draftKey(8));
  });

  it("round-trips the wizard, step included", () => {
    const text = serializeDraft("restricoes", data, new Date("2026-10-17T12:00:00Z"));
    const draft = parseDraft(text);
    expect(draft?.step).toBe("restricoes");
    expect(draft?.savedAt).toBe("2026-10-17T12:00:00.000Z");
    expect(draft?.data).toEqual(data);
  });

  it.each([
    ["nothing", null],
    ["not JSON", "{oops"],
    ["a number", "7"],
    ["another version", JSON.stringify({ v: 0, savedAt: "x", step: "s", data })],
    ["a missing field", JSON.stringify({ v: 1, savedAt: "x", step: "s", data: { ...data, name: undefined } })],
    ["stages that are not a list", JSON.stringify({ v: 1, savedAt: "x", step: "s", data: { ...data, stages: {} } })],
  ])("refuses %s instead of restoring a half-draft", (_label, text) => {
    expect(parseDraft(text as string | null)).toBeNull();
  });

  it("finds the largest editor id, so restored ids cannot be reused", () => {
    expect(maxIdSuffix(serializeDraft("function", data))).toBe(12);
    expect(maxIdSuffix("{}")).toBe(-1);
  });

  it("writes, reads and clears through storage", () => {
    const key = draftKey(1);
    expect(writeDraft(key, serializeDraft("function", data))).toBe(true);
    expect(readDraft(key)?.data.name).toBe("Viga leve");
    clearDraft(key);
    expect(readDraft(key)).toBeNull();
  });

  it("survives storage that throws (private window, quota)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(writeDraft("k", "x")).toBe(false);
    expect(readDraft("k")).toBeNull();
    expect(() => clearDraft("k")).not.toThrow();
  });
});
