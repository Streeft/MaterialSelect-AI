import { describe, expect, it } from "vitest";
import { matchRank, resolveClassicPairs } from "./compareClassics";

const m = (id: number, name: string, class_slug: string) => ({ id, name, class_slug });

const catalogue = [
  m(1, "Aço Demo 1020", "metais"),
  m(2, "Liga de Alumínio Demo 6061", "metais"),
  m(3, "Polipropileno Demo", "polimeros"),
  m(4, "Titânio Demo Ti-6Al-4V", "metais"),
];

const labelsOf = (pairs: ReturnType<typeof resolveClassicPairs>) =>
  pairs.map((p) => p.labels.join(" × "));

describe("pares clássicos do comparador (D-221)", () => {
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
    const labels = labelsOf(resolveClassicPairs(catalogue));
    expect(labels).not.toContain("PEAD × PP");
    expect(labels).not.toContain("Cobre × Alumínio");
    expect(resolveClassicPairs([])).toEqual([]);
  });

  it("nunca põe o mesmo registro dos dois lados", () => {
    const pairs = resolveClassicPairs([m(9, "Aço e alumínio clad", "metais")]);
    expect(pairs).toEqual([]);
  });
});

describe("palavra inteira, classe e começo do nome (D-229)", () => {
  it("“aço” não acha “Traço” numa argamassa", () => {
    const pairs = resolveClassicPairs([
      m(1, "Alumínio 1050A-O Recozido", "metais"),
      m(2, "Argamassa de Cimento e Areia Traço 1:3", "ceramicas"),
      m(3, "Aço Carbono 1045", "metais"),
    ]);
    expect(pairs.find((p) => p.labels[0] === "Aço")?.names).toEqual([
      "Aço Carbono 1045",
      "Alumínio 1050A-O Recozido",
    ]);
  });

  it("a argamassa sozinha não vira aço: o par some", () => {
    const pairs = resolveClassicPairs([
      m(1, "Alumínio 1050A-O Recozido", "metais"),
      m(2, "Argamassa de Cimento e Areia Traço 1:3", "metais"),
    ]);
    expect(labelsOf(pairs)).not.toContain("Aço × Alumínio");
  });

  it("titânio é o nome que começa por Titânio, não o aço estabilizado ao titânio", () => {
    const pairs = resolveClassicPairs([
      m(1, "Aço Inoxidável Austenítico AISI 321 Estabilizado ao Titânio", "metais"),
      m(2, "Argamassa de Cimento e Areia Traço 1:3", "ceramicas"),
      m(3, "Titânio Comercialmente Puro Grau 1", "metais"),
    ]);
    const titanium = pairs.find((p) => p.labels[0] === "Titânio");
    expect(titanium?.names).toEqual([
      "Titânio Comercialmente Puro Grau 1",
      "Aço Inoxidável Austenítico AISI 321 Estabilizado ao Titânio",
    ]);
  });

  it("PP é o polipropileno da classe dos polímeros, não o compósito de cânhamo", () => {
    const pairs = resolveClassicPairs([
      m(1, "NFRP Cânhamo / Polipropileno (Painel Automotivo)", "compositos"),
      m(2, "Polietileno de Alta Densidade (PEAD)", "polimeros"),
      m(3, "Vulcanizado Termoplástico EPDM/PP 64 Shore A", "elastomeros"),
      m(4, "Polipropileno Copolímero de Impacto", "polimeros"),
      m(5, "Polipropileno (PP)", "polimeros"),
    ]);
    expect(pairs.find((p) => p.labels[0] === "PEAD")?.names).toEqual([
      "Polietileno de Alta Densidade (PEAD)",
      "Polipropileno (PP)",
    ]);
  });

  it("vidro é da classe das cerâmicas, não o compósito de fibra de vidro", () => {
    const pairs = resolveClassicPairs([
      m(1, "BMC Vidro-E / Poliéster (Moldagem em Massa)", "compositos"),
      m(2, "Policarbonato (PC)", "polimeros"),
      m(3, "Vidro Borossilicato", "ceramicas"),
    ]);
    expect(pairs.find((p) => p.labels[0] === "Vidro")?.names).toEqual([
      "Vidro Borossilicato",
      "Policarbonato (PC)",
    ]);
  });

  it("classifica o nome: igual, começa, contém como palavra, ou não", () => {
    expect(matchRank("pp", "pp")).toBe(0);
    expect(matchRank("aco carbono 1045", "aco")).toBe(1);
    expect(matchRank("aco inox estabilizado ao titanio", "titanio")).toBe(2);
    expect(matchRank("polipropileno (pp)", "pp")).toBe(2);
    expect(matchRank("argamassa traco 1:3", "aco")).toBeNull();
    expect(matchRank("epdm/ppx", "pp")).toBeNull();
  });
});
