import { describe, expect, it } from "vitest";
import {
  CRITERION_PARAM,
  WEIGHT_PARAM,
  parseSettings,
  requestSettings,
  writeSettings,
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
