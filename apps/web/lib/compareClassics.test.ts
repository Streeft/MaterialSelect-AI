import { describe, expect, it } from "vitest";
import { resolveClassicPairs } from "./compareClassics";

const catalogue = [
  { id: 1, name: "Aço Demo 1020" },
  { id: 2, name: "Liga de Alumínio Demo 6061" },
  { id: 3, name: "Polipropileno Demo" },
  { id: 4, name: "Titânio Demo Ti-6Al-4V" },
];

describe("pares clássicos do comparador (D-220)", () => {
  it("acha cada lado pelo nome, sem acento nem caixa, na ordem do catálogo", () => {
    const pairs = resolveClassicPairs(catalogue);
    expect(pairs.map((p) => p.ids)).toEqual([
      [1, 2],
      [4, 1],
    ]);
    expect(pairs[0]?.names).toEqual(["Aço Demo 1020", "Liga de Alumínio Demo 6061"]);
  });

  it("um lado que o catálogo não tem tira o par inteiro", () => {
    // No HDPE, no copper, no glass: those pairs are not offered at all.
    const labels = resolveClassicPairs(catalogue).map((p) => p.labels.join(" × "));
    expect(labels).not.toContain("PEAD × PP");
    expect(labels).not.toContain("Cobre × Alumínio");
    expect(resolveClassicPairs([])).toEqual([]);
  });

  it("nunca põe o mesmo registro dos dois lados", () => {
    const pairs = resolveClassicPairs([{ id: 9, name: "Aço e alumínio clad" }]);
    expect(pairs).toEqual([]);
  });
});
