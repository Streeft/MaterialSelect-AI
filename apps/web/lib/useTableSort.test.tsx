import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTableSort } from "./useTableSort";

interface Row {
  name: string;
  cites: number | null;
}
const rows: Row[] = [
  { name: "Beta", cites: 3 },
  { name: "alfa", cites: null },
  { name: "Gama", cites: 12 },
];
const columns = {
  name: (r: Row) => r.name,
  cites: (r: Row) => r.cites,
};

describe("useTableSort (D-254)", () => {
  it("starts in the order the rows arrived, every column unsorted", () => {
    const { result } = renderHook(() => useTableSort(rows, columns));
    expect(result.current.rows.map((r) => r.name)).toEqual(["Beta", "alfa", "Gama"]);
    expect(result.current.head("name").sort).toBe("none");
  });

  it("cycles ascending, descending and back, saying so for aria-sort", () => {
    const { result } = renderHook(() => useTableSort(rows, columns));
    act(() => result.current.head("name").onSort());
    expect(result.current.rows.map((r) => r.name)).toEqual(["alfa", "Beta", "Gama"]);
    expect(result.current.head("name").sort).toBe("ascending");
    expect(result.current.head("cites").sort).toBe("none");
    act(() => result.current.head("name").onSort());
    expect(result.current.rows.map((r) => r.name)).toEqual(["Gama", "Beta", "alfa"]);
    expect(result.current.head("name").sort).toBe("descending");
    act(() => result.current.head("name").onSort());
    expect(result.current.rows.map((r) => r.name)).toEqual(["Beta", "alfa", "Gama"]);
  });

  it("sorts a count as a number and leaves the missing one last", () => {
    const { result } = renderHook(() => useTableSort(rows, columns));
    act(() => result.current.head("cites").onSort());
    expect(result.current.rows.map((r) => r.cites)).toEqual([3, 12, null]);
    act(() => result.current.head("cites").onSort());
    expect(result.current.rows.map((r) => r.cites)).toEqual([12, 3, null]);
  });
});
