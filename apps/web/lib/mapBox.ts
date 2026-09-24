import type { MapBox } from "@/lib/types";

/**
 * A region in the camelCase shape the map components use (`AshbyMap`'s
 * `BoxSelection`). Structural on purpose, so `lib/` never imports a component.
 */
export interface CamelBox {
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
}

/** Field names only — no number is touched here (D-81: units are the backend's). */
export function toMapBox(box: CamelBox): MapBox {
  return { x_min: box.xMin, x_max: box.xMax, y_min: box.yMin, y_max: box.yMax };
}

export function fromMapBox(box: MapBox): CamelBox {
  return { xMin: box.x_min, xMax: box.x_max, yMin: box.y_min, yMax: box.y_max };
}
