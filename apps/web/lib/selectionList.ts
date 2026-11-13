/**
 * A list of materials handed to the Selection (D-232).
 *
 * The map's lasso, the sizing shortlist and the catalogue's ticks all end with
 * a set of materials, and the Selection takes it as a "list" stage: the study's
 * universe is restricted to those records, and any limit the reader adds
 * narrows from there. The list travels as `?materiais=` in the Selection's
 * address, in the same compact form the comparator's links use (`idList`).
 */
import { encodeIdList, parseIdList } from "@/lib/idList";

/** Mirrors `MAX_STAGE_MATERIAL_IDS` in the API: the most materials one list stage names. */
export const MAX_LIST_MATERIALS = 200;

/** The Selection page's step that holds the stages (`SLUG_BY_STEP.constraints`). */
const CONSTRAINTS_STEP = "restricoes";

/** The ids the Selection will actually carry: once each, in order, at most the cap. */
export function listForSelection(ids: readonly number[]): { ids: number[]; truncated: boolean } {
  const distinct = Array.from(new Set(ids));
  return {
    ids: distinct.slice(0, MAX_LIST_MATERIALS),
    truncated: distinct.length > MAX_LIST_MATERIALS,
  };
}

/** The address that opens the Selection restricted to `ids` (capped, see `listForSelection`). */
export function selectionHrefForMaterials(ids: readonly number[]): string {
  const { ids: kept } = listForSelection(ids);
  return `/app/selecao?etapa=${CONSTRAINTS_STEP}&materiais=${encodeIdList(kept)}`;
}

/** The list a Selection link carries: positive integers only, once each, at most the cap. */
export function materialsFromParams(params: { get(name: string): string | null }): number[] {
  return listForSelection(parseIdList(params.get("materiais"))).ids;
}
