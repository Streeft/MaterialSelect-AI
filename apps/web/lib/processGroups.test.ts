import { describe, expect, it } from "vitest";
import { GROUP_FROM, groupBySubfamily } from "./processGroups";

const node = (id: number, slug: string, name: string, parent_id: number | null) => ({
  id,
  slug,
  name,
  parent_id,
});
const classes = [
  node(1, "conformacao", "Conformação", null),
  node(2, "usinagem", "Usinagem", 1),
  node(3, "fundicao-g", "Fundição", 1),
  node(4, "areia", "Fundição em areia", 3), // a grandchild: rolls up into "Fundição"
  node(5, "uniao", "União", null),
  node(6, "solda", "Solda", 5),
];
const proc = (name: string, class_slug: string) => ({ name, class_slug });

describe("groupBySubfamily (D-254)", () => {
  it("agrupa pelo filho direto da raiz, mesmo para um processo arquivado mais fundo", () => {
    const groups = groupBySubfamily("conformacao", classes, [
      proc("Torneamento", "usinagem"),
      proc("Fundição em areia verde", "areia"),
      proc("Fresamento", "usinagem"),
      proc("Fundição sob pressão", "fundicao-g"),
    ]);
    expect(groups.map((g) => [g.name, g.processes.map((p) => p.name)])).toEqual([
      ["Fundição", ["Fundição em areia verde", "Fundição sob pressão"]],
      ["Usinagem", ["Torneamento", "Fresamento"]],
    ]);
  });

  it("ordena as subfamílias sem acento nem caixa e deixa o que está na raiz por último", () => {
    const withRoot = [...classes, node(7, "abrasivo", "Ábrasivo", 1)];
    const groups = groupBySubfamily("conformacao", withRoot, [
      proc("Direto", "conformacao"),
      proc("Torneamento", "usinagem"),
      proc("Jato", "abrasivo"),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Ábrasivo", "Usinagem", null]);
    expect(groups.at(-1)?.slug).toBeNull();
  });

  it("não mistura famílias e cada processo cai em exatamente um grupo", () => {
    const all = [
      proc("Torneamento", "usinagem"),
      proc("Solda MIG", "solda"),
      proc("Fundição", "fundicao-g"),
      proc("Areia", "areia"),
    ];
    const groups = groupBySubfamily("conformacao", classes, all);
    const flat = groups.flatMap((g) => g.processes.map((p) => p.name)).sort();
    expect(flat).toEqual(["Areia", "Fundição", "Torneamento"]);
    expect(groupBySubfamily("uniao", classes, all).map((g) => g.name)).toEqual(["Solda"]);
  });

  it("subfamília sem processo não ganha grupo e família sem processo devolve vazio", () => {
    expect(groupBySubfamily("conformacao", classes, [proc("Torneamento", "usinagem")]).map((g) => g.name)).toEqual([
      "Usinagem",
    ]);
    expect(groupBySubfamily("conformacao", classes, [])).toEqual([]);
  });

  it("uma raiz que a lista de classes ainda não trouxe não derruba a tela", () => {
    expect(groupBySubfamily("nova", classes, [proc("X", "nova")])).toEqual([
      { slug: null, name: null, processes: [proc("X", "nova")] },
    ]);
  });

  it("classes em ciclo, fora da árvore da raiz, terminam e não entram no cartão", () => {
    const cyclic = [node(1, "raiz", "Raiz", null), node(8, "a", "A", 9), node(9, "b", "B", 8)];
    const groups = groupBySubfamily("raiz", cyclic, [proc("P", "a")]);
    expect(groups).toEqual([]);
  });

  it("o limiar do cartão é 12 processos", () => {
    expect(GROUP_FROM).toBe(12);
  });
});
