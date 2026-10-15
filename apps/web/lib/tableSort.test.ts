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
});
