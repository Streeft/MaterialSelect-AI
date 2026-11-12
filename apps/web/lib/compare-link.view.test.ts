import { describe, expect, it } from "vitest";
import { compareSearch, parseView, readCompareLink } from "./compare-link";

const base = {
  materials: [1, 2],
  reference: null,
  threshold: null,
  catalogue: [],
  expressions: [],
  properties: ["densidade"],
  normalization: "minmax" as const,
};

describe("comparador: a visão e o 'só diferenças' vão no link (D-214)", () => {
  it("a tabela e o filtro desligado não entram no endereço", () => {
    expect(compareSearch("", { ...base, view: "table", onlyDifferences: false })).toBe(
      "?materiais=1%2C2&propriedades=densidade",
    );
  });

  it("outra visão e o filtro ligado viajam e voltam iguais", () => {
    const search = compareSearch("", { ...base, view: "heatmap", onlyDifferences: true });
    expect(search).toContain("visao=heatmap");
    expect(search).toContain("diferencas=1");
    const read = readCompareLink(new URLSearchParams(search));
    expect(read.view).toBe("heatmap");
    expect(read.onlyDifferences).toBe(true);
  });

  it("uma visão desconhecida volta ao padrão, sem erro", () => {
    expect(parseView("tridimensional")).toBe("table");
    expect(parseView(null)).toBe("table");
    expect(readCompareLink(new URLSearchParams("visao=x&diferencas=2"))).toMatchObject({
      view: "table",
      onlyDifferences: false,
    });
  });

  it("sem materiais o link continua nu, mesmo com visão escolhida", () => {
    expect(
      compareSearch("", { ...base, materials: [], view: "radar", onlyDifferences: true }),
    ).toBe("");
  });
});
