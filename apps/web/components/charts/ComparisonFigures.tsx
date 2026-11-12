/**
 * The four comparison figures, one file each (D-214).
 *
 * This file used to hold all four (1.184 lines); it now only re-exports them, so
 * every import of `./ComparisonFigures` keeps working and none of the figures'
 * props changed. The shared pieces stay in `comparisonShared`, `comparisonDensity`,
 * `figureKit` and `DenseFigures`.
 */
export { GroupedBarsFigure } from "./figures/GroupedBarsFigure";
export { RadarFigure } from "./figures/RadarFigure";
export { ParallelFigure } from "./figures/ParallelFigure";
export { HeatmapFigure } from "./figures/HeatmapFigure";

export type { CompareSeries, CompareAxisView, ScoreOf } from "./comparisonShared";
