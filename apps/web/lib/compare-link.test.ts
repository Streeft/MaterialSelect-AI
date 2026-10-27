import { describe, expect, it } from "vitest";
import { MAX_COMPUTED } from "./compare-expression";
import { MAX_COMPARE_PROPERTIES } from "./compareLimits";
import {
  MAX_EXPRESSION_LENGTH,
  parseNormalization,
  parseProperties,
  compareSearch,
  parseCatalogueSlugs,
  parseExpressions,
  readCompareLink,
} from "./compare-link";

const EMPTY = {
  materials: [],
  reference: null,
  threshold: null,
  catalogue: [],
  expressions: [],
  properties: [],
  normalization: "minmax" as const,
};

describe("parseExpressions (D-163)", () => {
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

describe("parseCatalogueSlugs (D-163)", () => {
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

describe("compareSearch (D-163)", () => {
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
      properties: [],
      normalization: "minmax",
    });
    const params = new URLSearchParams(search);
    expect(params.get("materiais")).toBe("3,7");
    expect(params.get("referencia")).toBe("7");
    expect(params.get("limiar")).toBe("7.5");
    // A comma inside an expression survives: it is a repeated parameter.
    expect(params.getAll("indice")).toEqual(["max(a, b) / c", "sqrt(modulo_young) / densidade"]);
    expect(readCompareLink(params)).toMatchObject({
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

describe("readCompareLink (D-163)", () => {
  it("limiar inválido do link é descartado, sem conserto", () => {
    expect(readCompareLink(new URLSearchParams("limiar=5000")).threshold).toBeNull();
  });
});

describe("propriedades e normalização no link (D-174)", () => {
  it("lê a lista, sem repetidos, e diz o que não tem forma de slug", () => {
    expect(parseProperties("densidade, modulo_young,densidade,<b>,a b")).toEqual({
      slugs: ["densidade", "modulo_young"],
      malformed: ["<b>", "a b"],
      overCap: 0,
    });
  });

  it("sem o parâmetro (ou vazio) não há escolha: nulo, não lista vazia", () => {
    expect(parseProperties(null).slugs).toBeNull();
    expect(parseProperties("").slugs).toBeNull();
    expect(parseProperties("  ").slugs).toBeNull();
  });

  it("corta no teto da comparação e conta o que ficou de fora", () => {
    const many = Array.from({ length: MAX_COMPARE_PROPERTIES + 3 }, (_, i) => `p${i}`).join(",");
    const parsed = parseProperties(many);
    expect(parsed.slugs).toHaveLength(MAX_COMPARE_PROPERTIES);
    expect(parsed.overCap).toBe(3);
  });

  it("não cita um pedaço enorme por inteiro", () => {
    expect(parseProperties("x y".padEnd(300, "z")).malformed[0]?.length).toBeLessThanOrEqual(61);
  });

  it("normalização: as duas conhecidas passam; outra volta como escrita, para ser dita", () => {
    expect(parseNormalization("vector")).toEqual({ value: "vector", invalid: null });
    expect(parseNormalization("minmax")).toEqual({ value: "minmax", invalid: null });
    expect(parseNormalization("zscore")).toEqual({ value: null, invalid: "zscore" });
    expect(parseNormalization(null)).toEqual({ value: null, invalid: null });
  });

  it("o endereço leva propriedades e normalização não padrão, e lê de volta", () => {
    const search = compareSearch("?nivel=L2", {
      ...EMPTY,
      materials: [1, 2],
      properties: ["densidade", "modulo_young"],
      normalization: "vector",
    });
    const params = new URLSearchParams(search);
    expect(params.get("propriedades")).toBe("densidade,modulo_young");
    expect(params.get("normalizacao")).toBe("vector");
    expect(params.get("nivel")).toBe("L2");
    const read = readCompareLink(params);
    expect(read.properties.slugs).toEqual(["densidade", "modulo_young"]);
    expect(read.normalization.value).toBe("vector");
  });

  it("a normalização padrão não ocupa o endereço, e sem material ele continua nu", () => {
    expect(
      compareSearch("", { ...EMPTY, materials: [1], properties: ["densidade"] }),
    ).toBe("?materiais=1&propriedades=densidade");
    expect(
      compareSearch("?propriedades=x&normalizacao=vector", {
        ...EMPTY,
        properties: ["densidade"],
        normalization: "vector",
      }),
    ).toBe("");
  });
});
