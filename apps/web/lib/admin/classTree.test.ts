import { describe, expect, it } from "vitest";
import type { MaterialClass } from "@/lib/types";
import { classTreeRows, parentIds } from "./classTree";

function cls(id: number, name: string, parent_id: number | null = null): MaterialClass {
  return { id, name, slug: name.toLowerCase(), parent_id, description: null, material_count: 0 } as MaterialClass;
}

const CLASSES = [
  cls(1, "Metais"),
  cls(2, "Aços", 1),
  cls(3, "Aço inoxidável", 2),
  cls(4, "Alumínio", 1),
  cls(5, "Polímeros"),
];

const names = (rows: ReturnType<typeof classTreeRows>) => rows.map((r) => `${"·".repeat(r.depth)}${r.cls.name}`);

describe("árvore de classes do Admin (D-238)", () => {
  it("põe os pais antes dos filhos, com a profundidade e quem tem filhos", () => {
    const rows = classTreeRows(CLASSES);
    expect(names(rows)).toEqual(["Metais", "·Aços", "··Aço inoxidável", "·Alumínio", "Polímeros"]);
    expect(rows.map((r) => r.hasChildren)).toEqual([true, true, false, false, false]);
  });

  it("recolher esconde a subárvore inteira", () => {
    expect(names(classTreeRows(CLASSES, { collapsed: new Set([1]) }))).toEqual(["Metais", "Polímeros"]);
    expect(names(classTreeRows(CLASSES, { collapsed: new Set([2]) }))).toEqual([
      "Metais",
      "·Aços",
      "·Alumínio",
      "Polímeros",
    ]);
  });

  it("a busca acha sem acento e mostra o caminho, mesmo num galho recolhido", () => {
    const rows = classTreeRows(CLASSES, { query: "inox", collapsed: new Set([1]) });
    expect(names(rows)).toEqual(["Metais", "·Aços", "··Aço inoxidável"]);
    expect(rows.map((r) => r.ancestorOnly)).toEqual([true, true, false]);
    expect(names(classTreeRows(CLASSES, { query: "aluminio" }))).toEqual(["Metais", "·Alumínio"]);
    expect(classTreeRows(CLASSES, { query: "cerâmica" })).toEqual([]);
  });

  it("um pai que não veio na lista não esconde o filho", () => {
    expect(names(classTreeRows([cls(9, "Órfã", 99)]))).toEqual(["Órfã"]);
  });

  it("recolher tudo dobra só quem tem filhos", () => {
    expect([...parentIds(CLASSES)].sort()).toEqual([1, 2]);
  });
});
