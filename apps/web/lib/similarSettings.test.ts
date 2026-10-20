import { describe, expect, it } from "vitest";
import {
  CRITERION_PARAM,
  TOLERANCE_PARAM,
  WEIGHT_PARAM,
  parseSettings,
  parseTolerance,
  parseToleranceInput,
  requestSettings,
  writeSettings,
  writeTolerance,
} from "./similarSettings";

describe("ajustes de proximidade na URL (D-120)", () => {
  it("lê peso e critério", () => {
    const params = new URLSearchParams(
      `${WEIGHT_PARAM}=densidade:2&${CRITERION_PARAM}=densidade:menor`,
    );
    expect(parseSettings(params)).toEqual({
      weights: { densidade: 2 },
      criteria: { densidade: "at_most" },
    });
  });

  it("descarta peso inválido em vez de consertá-lo", () => {
    const params = new URLSearchParams(
      `${WEIGHT_PARAM}=a:0,b:-1,c:11,d:abc,e:1,f:3&${CRITERION_PARAM}=a:quase,b:maior`,
    );
    expect(parseSettings(params)).toEqual({
      weights: { f: 3 },
      criteria: { b: "at_least" },
    });
  });

  it("escreve só o que difere do padrão e só da base", () => {
    const next = writeSettings(
      new URLSearchParams("ref=1"),
      {
        weights: { a: 2, b: 1, fora: 3 },
        criteria: { a: "both", b: "at_least" },
      },
      ["a", "b"],
    );
    expect(next.get("ref")).toBe("1");
    expect(next.get(WEIGHT_PARAM)).toBe("a:2");
    expect(next.get(CRITERION_PARAM)).toBe("b:maior");
  });

  it("apaga os parâmetros quando tudo volta ao padrão", () => {
    const next = writeSettings(
      new URLSearchParams(`${WEIGHT_PARAM}=a:2&${CRITERION_PARAM}=a:menor`),
      { weights: {}, criteria: {} },
      ["a"],
    );
    expect(next.has(WEIGHT_PARAM)).toBe(false);
    expect(next.has(CRITERION_PARAM)).toBe(false);
  });

  it("ida e volta preserva os ajustes", () => {
    const settings = {
      weights: { a: 0.5 },
      criteria: { b: "at_most" as const },
    };
    expect(
      parseSettings(writeSettings(new URLSearchParams(), settings, ["a", "b"])),
    ).toEqual(settings);
  });

  it("não manda ao servidor ajuste de propriedade fora da base", () => {
    expect(
      requestSettings({ weights: { a: 2, b: 3 }, criteria: { b: "at_most" } }, [
        "a",
      ]),
    ).toEqual({ weights: { a: 2 }, criteria: {} });
  });
});

describe("tolerância na URL (D-155)", () => {
  it("lê o que se digita, com vírgula, e recusa fora de (0, 100]", () => {
    expect(parseToleranceInput("")).toBeNull();
    expect(parseToleranceInput("  ")).toBeNull();
    expect(parseToleranceInput("10")).toBe(10);
    expect(parseToleranceInput("2,5")).toBe(2.5);
    expect(parseToleranceInput("5%")).toBe(5);
    expect(parseToleranceInput("100")).toBe(100);
    expect(parseToleranceInput("0")).toBe("invalid");
    expect(parseToleranceInput("-3")).toBe("invalid");
    expect(parseToleranceInput("100,1")).toBe("invalid");
    expect(parseToleranceInput("abc")).toBe("invalid");
    expect(parseToleranceInput("Infinity")).toBe("invalid");
  });

  it("descarta valor inválido da URL em vez de consertar", () => {
    const read = (raw: string) =>
      parseTolerance(new URLSearchParams(`${TOLERANCE_PARAM}=${raw}`));
    expect(read("10")).toBe(10);
    expect(read("0")).toBeNull();
    expect(read("x")).toBeNull();
    expect(parseTolerance(new URLSearchParams())).toBeNull();
  });

  it("grava e apaga a tolerância sem tocar nos outros parâmetros", () => {
    const base = new URLSearchParams(`${WEIGHT_PARAM}=densidade:2`);
    const set = writeTolerance(base, 7.5);
    expect(set.get(TOLERANCE_PARAM)).toBe("7.5");
    expect(set.get(WEIGHT_PARAM)).toBe("densidade:2");
    expect(writeTolerance(set, null).has(TOLERANCE_PARAM)).toBe(false);
  });
});
