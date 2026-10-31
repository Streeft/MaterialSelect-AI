import { describe, expect, it } from "vitest";
import { MAX_LINK_IDS, encodeIdList, parseIdList } from "./idList";

describe("encodeIdList / parseIdList (D-187)", () => {
  it("writes runs of three or more as a range and keeps the rest as they are", () => {
    expect(encodeIdList([1, 2, 3, 7, 9, 10, 11, 12, 20, 21])).toBe("1-3,7,9-12,20,21");
  });

  it("keeps the given order: a ranking is not sorted", () => {
    expect(encodeIdList([5, 4, 3])).toBe("5,4,3");
    expect(parseIdList("5,4,3")).toEqual([5, 4, 3]);
  });

  it("round-trips any list", () => {
    const ids = [3, 4, 5, 6, 1, 2, 10, 12, 13, 14];
    expect(parseIdList(encodeIdList(ids))).toEqual(ids);
  });

  it("reads the plain list of every older link", () => {
    expect(parseIdList("1,2,3")).toEqual([1, 2, 3]);
  });

  it("makes the whole catalogue a few characters when it is contiguous", () => {
    const all = Array.from({ length: 679 }, (_, i) => i + 1);
    expect(encodeIdList(all)).toBe("1-679");
    expect(parseIdList("1-679")).toHaveLength(679);
  });

  it("is no longer than the plain list when the ids are scattered", () => {
    const scattered = Array.from({ length: 679 }, (_, i) => i * 3 + 1);
    expect(encodeIdList(scattered).length).toBeLessThanOrEqual(scattered.join(",").length);
  });

  it("drops what is not an id and bounds a runaway range", () => {
    expect(parseIdList("0,-4,abc,5-2,7")).toEqual([7]);
    expect(parseIdList("1-99999999")).toHaveLength(MAX_LINK_IDS);
    expect(parseIdList(null)).toEqual([]);
  });
});
