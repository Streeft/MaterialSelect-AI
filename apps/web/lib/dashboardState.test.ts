import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  dashboardSearch,
  readDashboardState,
  toggleSubclass,
  uniqueSubclasses,
} from "./dashboardState";
import { dashboardQuery } from "./api";

describe("dashboardState: várias subclasses (D-250)", () => {
  it("reads repeated subclasse once each, blanks dropped, in the order given", () => {
    const state = readDashboardState(new URLSearchParams("subclasse=A%C3%A7os&subclasse=&subclasse=Laminado&subclasse=A%C3%A7os"));
    expect(state.filters.subclasses).toEqual(["Aços", "Laminado"]);
  });

  it("writes them back as repeated keys, and a link round-trips", () => {
    const state = readDashboardState(new URLSearchParams("aba=propriedades&subclasse=Aços&subclasse=Laminado"));
    const search = dashboardSearch(state);
    expect(new URLSearchParams(search.slice(1)).getAll("subclasse")).toEqual(["Aços", "Laminado"]);
    expect(readDashboardState(new URLSearchParams(search.slice(1)))).toEqual(state);
  });

  it("counts the subclass filter once, however many subclasses", () => {
    expect(activeFilterCount({ subclasses: ["A", "B", "C"] })).toBe(1);
    expect(activeFilterCount({ subclasses: [] })).toBe(0);
  });

  it("toggles one subclass in and out", () => {
    expect(toggleSubclass(["A"], "B")).toEqual(["A", "B"]);
    expect(toggleSubclass(["A", "B"], "A")).toEqual(["B"]);
    expect(uniqueSubclasses([" A ", "A", ""])).toEqual(["A"]);
  });

  it("the API query repeats subclasse the same way", () => {
    expect(dashboardQuery({ subclasses: ["Aços", "Laminado"] })).toBe("?subclasse=A%C3%A7os&subclasse=Laminado");
  });
});
