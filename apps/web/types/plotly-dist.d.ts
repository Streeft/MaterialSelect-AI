// `react-plotly.js` bundles `plotly.js/dist/plotly`, which ships no type
// declarations. Rather than pull the whole `@types/plotly.js` surface in for a
// single call, declare only what the export helper actually uses.

declare module "plotly.js/dist/plotly" {
  export interface PlotlyToImageOptions {
    format: "png" | "svg" | "jpeg" | "webp";
    width?: number;
    height?: number;
    scale?: number;
  }

  export interface PlotlyStatic {
    /** Render an already-drawn graph div to a data URL. */
    toImage(root: HTMLElement, options: PlotlyToImageOptions): Promise<string>;
  }

  const Plotly: PlotlyStatic;
  export default Plotly;
}
