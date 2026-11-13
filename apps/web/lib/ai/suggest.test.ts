import { describe, expect, it } from "vitest";
import type { SuggestAction } from "@/lib/types";
import { isInternalPath, isWellFormedAction, visibleActions } from "./suggest";

describe("lib/ai/suggest (D-229)", () => {
  it("accepts only internal paths", () => {
    expect(isInternalPath("/app/catalogo")).toBe(true);
    expect(isInternalPath("//example.com")).toBe(false);
    expect(isInternalPath("https://example.com")).toBe(false);
    expect(isInternalPath("/\\evil")).toBe(false);
    expect(isInternalPath(undefined)).toBe(false);
  });

  it("checks the shape each type promises", () => {
    const ok: SuggestAction[] = [
      { type: "set_axes", label: "a", x: "x", y: "y" },
      { type: "apply_preset", label: "a", id: "p" },
      { type: "set_index", label: "a", slug: "s" },
      { type: "add_filter", label: "a", field: "classe", value: "metais" },
      { type: "sort", label: "a", prop: "densidade", dir: "desc" },
      { type: "search", label: "a", q: "aço" },
      { type: "open_route", label: "a", path: "/app/painel" },
      { type: "compare", label: "a", ids: [1, 2] },
      { type: "set_param", label: "a", name: "n", value: 0 },
      { type: "map_column", label: "a", col: "c", prop: "p" },
      { type: "fill_text", label: "a", field: "f", text: "" },
    ];
    for (const action of ok) expect(isWellFormedAction(action), action.type).toBe(true);
    const bad = [
      { type: "set_axes", label: "a", x: "x" },
      { type: "sort", label: "a", prop: "p", dir: "up" },
      { type: "compare", label: "a", ids: [] },
      { type: "compare", label: "a", ids: [1.5] },
      { type: "search", label: "", q: "q" },
      { type: "nope", label: "a" },
      null,
      "texto",
    ];
    for (const action of bad) expect(isWellFormedAction(action)).toBe(false);
  });

  it("keeps the order and drops what the screen did not list", () => {
    const actions: SuggestAction[] = [
      { type: "search", label: "b", q: "q" },
      { type: "set_axes", label: "a", x: "x", y: "y" },
      { type: "compare", label: "c", ids: [1] },
    ];
    expect(visibleActions({ actions }, ["compare", "set_axes"]).map((a) => a.label)).toEqual(["a", "c"]);
  });
});
