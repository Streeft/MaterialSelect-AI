/**
 * The most materials one comparison request carries — mirrors MAX_COMPARE_MATERIALS in the API.
 * A safety valve, not a product limit (D-187): it sits far above the catalogue, so the
 * comparator and its figures take the whole selection.
 */
export const MAX_COMPARE_MATERIALS = 5000;
/** Fewer than this is not a comparison. */
export const MIN_COMPARE_MATERIALS = 2;
/** How many properties one comparison takes — mirrors MAX_COMPARE_PROPERTIES in the API; read by the page and by its link. */
export const MAX_COMPARE_PROPERTIES = 20;
