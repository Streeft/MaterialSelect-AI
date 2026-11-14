import { describe, expect, it } from "vitest";
import {
  MAX_LIST_MATERIALS,
  listForSelection,
  materialsFromParams,
  selectionHrefForMaterials,
} from "./selectionList";

describe("lista de materiais para a Seleção (D-232)", () => {
  it("monta o endereço compacto, na ordem dada", () => {
    expect(selectionHrefForMaterials([5, 1, 2, 3, 9])).toBe(
      "/app/selecao?etapa=restricoes&materiais=5,1-3,9",
    );
  });

  it("conta cada material uma vez e corta no teto do servidor", () => {
    expect(listForSelection([3, 3, 1])).toEqual({ ids: [3, 1], truncated: false });
    const many = Array.from({ length: MAX_LIST_MATERIALS + 5 }, (_, i) => i + 1);
    const { ids, truncated } = listForSelection(many);
    expect(ids).toHaveLength(MAX_LIST_MATERIALS);
    expect(truncated).toBe(true);
  });

  it("lê de volta o que o endereço carrega, ignorando o que não é id", () => {
    const params = new URLSearchParams({ materiais: "5,1-3,x,-2,9,5" });
    expect(materialsFromParams(params)).toEqual([5, 1, 2, 3, 9]);
    expect(materialsFromParams(new URLSearchParams())).toEqual([]);
  });
});
