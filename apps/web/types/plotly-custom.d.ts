// Plotly ships no type declarations for its à-la-carte entry points
// (`lib/core` plus one module per trace), and `@types/plotly.js` describes the
// *full* bundle — the very thing `lib/plotly-custom.ts` exists to avoid.
//
// Declare only what the custom bundle actually touches. The trace modules are
// opaque on purpose: nothing in this codebase inspects them, they are only
// handed back to `Plotly.register`.

declare module "plotly.js/lib/core" {
  export interface PlotlyToImageOptions {
    format: "png" | "svg" | "jpeg" | "webp";
    width?: number;
    height?: number;
    scale?: number;
  }

  export interface PlotlyStatic {
    /** Render an already-drawn graph div to a data URL. */
    toImage(root: HTMLElement, options: PlotlyToImageOptions): Promise<string>;
    /** Add trace modules to this Plotly instance. */
    register(modules: unknown[]): void;
  }

  const Plotly: PlotlyStatic;
  export default Plotly;
}

declare module "plotly.js/lib/bar" {
  const trace: unknown;
  export default trace;
}

declare module "plotly.js/lib/box" {
  const trace: unknown;
  export default trace;
}

declare module "plotly.js/lib/heatmap" {
  const trace: unknown;
  export default trace;
}

declare module "plotly.js/lib/scatter" {
  const trace: unknown;
  export default trace;
}

declare module "plotly.js/lib/scatterpolar" {
  const trace: unknown;
  export default trace;
}
