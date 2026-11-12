/**
 * Where the pointer is, in the map's data coordinates (D-213).
 *
 * The reader drags an index line; the page only says *where the pointer is*,
 * and the backend reads the level off the expression and returns the line
 * (ADR 0004). Locating the pointer is the inverse of the drawing itself —
 * Plotly's own pixel→data conversion of each axis (`p2d`, log or linear),
 * from the plot area's offset — so nothing about the index is computed here.
 *
 * `null` outside the plot area or when the figure is not drawn yet.
 */
interface PlotlyAxis {
  p2d?: (px: number) => unknown;
  _offset?: number;
  _length?: number;
}

interface PlotlyGraph extends HTMLElement {
  _fullLayout?: { xaxis?: PlotlyAxis; yaxis?: PlotlyAxis };
}

export function pointerToData(
  graph: HTMLElement | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const layout = (graph as PlotlyGraph | null)?._fullLayout;
  const xa = layout?.xaxis;
  const ya = layout?.yaxis;
  if (!graph || !xa?.p2d || !ya?.p2d) return null;
  const rect = graph.getBoundingClientRect();
  const px = clientX - rect.left - (xa._offset ?? 0);
  const py = clientY - rect.top - (ya._offset ?? 0);
  if (px < 0 || py < 0) return null;
  if (xa._length !== undefined && px > xa._length) return null;
  if (ya._length !== undefined && py > ya._length) return null;
  const x = Number(xa.p2d(px));
  const y = Number(ya.p2d(py));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
