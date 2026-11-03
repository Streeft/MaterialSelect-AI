import { describe, expect, it } from "vitest";
import { FUNCTION_PARAM_MAX, functionFromParams, selectionHrefWithFunction } from "./functionParam";

describe("função pela URL (D-195)", () => {
  it("leva o texto à primeira etapa e volta igual", () => {
    const href = selectionHrefWithFunction("  Mola que guarde energia  ");
    expect(href).toBe("/app/selecao?etapa=funcao&funcao=Mola+que+guarde+energia");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(functionFromParams(params)).toBe("Mola que guarde energia");
  });

  it("em branco abre a seleção vazia", () => {
    expect(selectionHrefWithFunction("   ")).toBe("/app/selecao");
    expect(functionFromParams(new URLSearchParams())).toBe("");
  });

  it("corta no limite, dos dois lados", () => {
    const long = "a".repeat(FUNCTION_PARAM_MAX + 50);
    const params = new URLSearchParams(selectionHrefWithFunction(long).split("?")[1]);
    expect(params.get("funcao")).toHaveLength(FUNCTION_PARAM_MAX);
    expect(functionFromParams(new URLSearchParams({ funcao: long }))).toHaveLength(FUNCTION_PARAM_MAX);
  });
});
