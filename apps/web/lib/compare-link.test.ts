import { describe, expect, it } from "vitest";
import { MAX_COMPUTED } from "./compare-expression";
import {
  MAX_EXPRESSION_LENGTH,
  compareSearch,
  parseCatalogueSlugs,
  parseExpressions,
  readCompareLink,
} from "./compare-link";

const EMPTY = { materials: [], reference: null, threshold: null, catalogue: [], expressions: [] };

describe("parseExpressions (D-160)", () => {
  it("mantém a ordem, apara e junta o que só difere em espaços", () => {
    expect(parseExpressions([" a / b ", "a/b", "sqrt(c)"])).toEqual(["a / b", "sqrt(c)"]);
  });

  it("descarta vazia e longa demais, sem cortar a longa", () => {
    expect(parseExpressions(["", "   ", "x".repeat(MAX_EXPRESSION_LENGTH + 1), "ok"])).toEqual(["ok"]);
    expect(parseExpressions(["x".repeat(MAX_EXPRESSION_LENGTH)])).toHaveLength(1);
  });

  it("respeita o teto de colunas calculadas", () => {
    const many = Array.from({ length: MAX_COMPUTED + 5 }, (_, i) => `a${i} / b`);
    expect(parseExpressions(many)).toHaveLength(MAX_COMPUTED);
  });
});

describe("parseCatalogueSlugs (D-160)", () => {
  it("lê a lista separada por vírgula, sem repetidos", () => {
    expect(parseCatalogueSlugs("rigidez-especifica, resistencia_especifica,rigidez-especifica")).toEqual([
      "rigidez-especifica",
      "resistencia_especifica",
    ]);
  });

  it("descarta o que não tem forma de slug", () => {
    expect(parseCatalogueSlugs("a b,<script>,,ok")).toEqual(["ok"]);
    expect(parseCatalogueSlugs(null)).toEqual([]);
    expect(parseCatalogueSlugs("")).toEqual([]);
  });
});

describe("compareSearch (D-160)", () => {
  it("o link de uma comparação vazia é o caminho puro", () => {
    expect(compareSearch("?materiais=1&limiar=5", EMPTY)).toBe("");
  });

  it("escreve cada parte e lê de volta o que escreveu", () => {
    const search = compareSearch("", {
      materials: [3, 7],
      reference: 7,
      threshold: 7.5,
      catalogue: ["rigidez-especifica"],
      expressions: ["max(a, b) / c", "sqrt(modulo_young) / densidade"],
    });
    const params = new URLSearchParams(search);
    expect(params.get("materiais")).toBe("3,7");
    expect(params.get("referencia")).toBe("7");
    expect(params.get("limiar")).toBe("7.5");
    // A comma inside an expression survives: it is a repeated parameter.
    expect(params.getAll("indice")).toEqual(["max(a, b) / c", "sqrt(modulo_young) / densidade"]);
    expect(readCompareLink(params)).toEqual({
      threshold: 7.5,
      catalogue: ["rigidez-especifica"],
      expressions: ["max(a, b) / c", "sqrt(modulo_young) / densidade"],
    });
  });

  it("não escreve referência que saiu da lista de materiais", () => {
    expect(compareSearch("", { ...EMPTY, materials: [1], reference: 9 })).toBe("?materiais=1");
  });

  it("deixa em paz o que a tela não possui", () => {
    const search = compareSearch("?nivel=L2&limiar=3&indice=velho", {
      ...EMPTY,
      materials: [1],
      threshold: 10,
    });
    const params = new URLSearchParams(search);
    expect(params.get("nivel")).toBe("L2");
    expect(params.get("limiar")).toBe("10");
    expect(params.has("indice")).toBe(false);
  });
});

describe("readCompareLink (D-160)", () => {
  it("limiar inválido do link é descartado, sem conserto", () => {
    expect(readCompareLink(new URLSearchParams("limiar=5000")).threshold).toBeNull();
  });
});
