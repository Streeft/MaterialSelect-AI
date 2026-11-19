import { describe, expect, it } from "vitest";
import { ariaSort, nextSort, sortRows } from "./tableSort";

describe("tableSort (D-131)", () => {
  const rows = [{ n: "Zinco" }, { n: "água" }, { n: "Aço 2" }, { n: "Aço 10" }, { n: "aço 1" }];
  const label = (r: { n: string }) => r.n;

  it("orders by label ignoring case and accents, digits as numbers", () => {
    expect(sortRows(rows, label, "asc").map(label)).toEqual(["aço 1", "Aço 2", "Aço 10", "água", "Zinco"]);
    expect(sortRows(rows, label, "desc").map(label)).toEqual(["Zinco", "água", "Aço 10", "Aço 2", "aço 1"]);
  });

  it("returns a copy and is stable for equal labels", () => {
    const same = [{ n: "A", id: 1 }, { n: "a", id: 2 }, { n: "A", id: 3 }];
    const out = sortRows(same, (r) => r.n, "desc");
    expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(out).not.toBe(same);
  });

  it("cycles ascending, descending, then back to the original order", () => {
    const first = nextSort<"name" | "class">(null, "name");
    expect(first).toEqual({ key: "name", dir: "asc" });
    const second = nextSort(first, "name");
    expect(second).toEqual({ key: "name", dir: "desc" });
    expect(nextSort(second, "name")).toBeNull();
    expect(nextSort(second, "class")).toEqual({ key: "class", dir: "asc" });
  });

  it("states the order in the words aria-sort uses", () => {
    expect(ariaSort(null, "name")).toBe("none");
    expect(ariaSort({ key: "name", dir: "asc" }, "name")).toBe("ascending");
    expect(ariaSort({ key: "name", dir: "desc" }, "name")).toBe("descending");
    expect(ariaSort({ key: "name", dir: "desc" }, "class")).toBe("none");
  });

  it("puts absent values after the others, in both directions, never as a zero (D-254)", () => {
    const counts = [{ n: 10 }, { n: null }, { n: 9 }, { n: 0 }, { n: undefined }, { n: 100 }];
    const value = (r: { n: number | null | undefined }) => r.n;
    expect(sortRows(counts, value, "asc").map(value)).toEqual([0, 9, 10, 100, null, undefined]);
    expect(sortRows(counts, value, "desc").map(value)).toEqual([100, 10, 9, 0, null, undefined]);
  });

  it("orders counts as numbers, not as text", () => {
    const rows = [{ c: 9 }, { c: 100 }, { c: 21 }];
    expect(sortRows(rows, (r) => r.c, "asc").map((r) => r.c)).toEqual([9, 21, 100]);
  });
});
