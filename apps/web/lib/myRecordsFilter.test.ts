import { describe, expect, it } from "vitest";
import type { Bookmark, MaterialListItem } from "./types";
import {
  MY_RECORDS_URL,
  bookmarkKey,
  classOptions,
  filterBookmarks,
  filterOwn,
} from "./myRecordsFilter";
import { readUrlState } from "./urlState";

const quality = { medido: 1, importado: 0, estimado: 0, missing: 0 };
const mat = (id: number, name: string, slug: string, cls: string): MaterialListItem => ({
  id,
  name,
  class_name: cls,
  class_slug: slug,
  subclass: null,
  is_demo: false,
  is_own_record: true,
  keywords: [],
  quality,
  designations: [],
});
const aco = mat(1, "Aço 1020", "metais", "Metais");
const pet = mat(2, "PET", "polimeros", "Polímeros");
const material = (m: MaterialListItem): Bookmark => ({
  universe: "material",
  at: "2026-01-01T00:00:00Z",
  material: m,
  process: null,
});
const proc: Bookmark = {
  universe: "process",
  at: "2026-01-01T00:00:00Z",
  material: null,
  process: {
    id: 3,
    name: "Fundição",
    slug: "fundicao",
    class_id: 1,
    class_name: "Conformação",
    class_slug: "conformacao",
    description: null,
    is_demo: true,
    material_count: 2,
  },
};
const all = [material(aco), material(pet), proc];
const none = { visao: "todos" as const, q: "", classe: "", tipo: "todos" as const };

describe("filtros de Meus registros", () => {
  it("lê q, classe e tipo do endereço e ignora tipo desconhecido", () => {
    expect(readUrlState(MY_RECORDS_URL, "?q=aco&classe=metais&tipo=processo")).toEqual({
      visao: "todos",
      q: "aco",
      classe: "metais",
      tipo: "processo",
    });
    expect(readUrlState(MY_RECORDS_URL, "?tipo=xyz").tipo).toBe("todos");
    // D-232b: the view is in the address too; an unknown one is "Todos".
    expect(readUrlState(MY_RECORDS_URL, "?visao=favoritos").visao).toBe("favoritos");
    expect(readUrlState(MY_RECORDS_URL, "?visao=xyz").visao).toBe("todos");
  });

  it("busca sem acento nem caixa", () => {
    expect(filterBookmarks(all, { ...none, q: "FUNDICAO" })).toEqual([proc]);
    expect(filterBookmarks(all, { ...none, q: "aco" })).toEqual([material(aco)]);
  });

  it("filtra por classe e por tipo", () => {
    expect(filterBookmarks(all, { ...none, classe: "polimeros" })).toEqual([material(pet)]);
    expect(filterBookmarks(all, { ...none, tipo: "processo" })).toEqual([proc]);
    expect(filterBookmarks(all, { ...none, tipo: "material" })).toHaveLength(2);
  });

  it("registro próprio é material: some quando o tipo é processo", () => {
    expect(filterOwn([aco, pet], { ...none, tipo: "processo" })).toEqual([]);
    expect(filterOwn([aco, pet], { ...none, classe: "metais" })).toEqual([aco]);
  });

  it("lista as classes que existem nos registros, sem repetir, em ordem", () => {
    expect(classOptions(all, [aco])).toEqual([
      { value: "conformacao", label: "Conformação" },
      { value: "metais", label: "Metais" },
      { value: "polimeros", label: "Polímeros" },
    ]);
  });

  it("a chave do favorito separa os universos", () => {
    expect(bookmarkKey(material(aco))).toBe("material-1");
    expect(bookmarkKey(proc)).toBe("process-3");
  });
});
