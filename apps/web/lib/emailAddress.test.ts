import { describe, expect, it } from "vitest";
import { hasAddress, isValidEmail, splitAddresses } from "./emailAddress";

describe("isValidEmail (D-242)", () => {
  it.each(["ana@empresa.com.br", "a.b+c@sub.dominio.org", "ANA@EMPRESA.COM", "x_y@a-b.co"])(
    "accepts %s",
    (value) => expect(isValidEmail(value)).toBe(true),
  );

  it.each([
    "",
    "sem-arroba.com",
    "a@b",
    "a@@b.com",
    "a b@c.com",
    "a..b@c.com",
    ".a@c.com",
    "a@-b.com",
    "Ana <a@c.com>",
    "ç@c.com",
    "a@c.c",
  ])("refuses %j", (value) => expect(isValidEmail(value)).toBe(false));
});

describe("splitAddresses", () => {
  it("splits a pasted list at commas, semicolons, spaces and lines", () => {
    expect(splitAddresses("a@x.com, b@x.com;c@x.com\nd@x.com  e@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
      "e@x.com",
    ]);
  });
  it("drops the empty pieces", () => {
    expect(splitAddresses(" , ;")).toEqual([]);
  });
});

describe("hasAddress", () => {
  it("ignores capitals", () => {
    expect(hasAddress(["Ana@X.com"], "ana@x.COM")).toBe(true);
    expect(hasAddress(["ana@x.com"], "bia@x.com")).toBe(false);
  });
});
