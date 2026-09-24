/**
 * The Plotly build this application actually needs.
 *
 * `react-plotly.js` requires `plotly.js/dist/plotly`, the complete bundle: every
 * trace type Plotly has, including the WebGL 3-D family (which drags in `regl`),
 * the Mapbox maps (which drag in `mapbox-gl`) and the geographic projections
 * (which drag in `topojson`). Measured on this project it weighed **4.5 MB** —
 * 79% of all the JavaScript the app shipped — to draw five kinds of figure.
 *
 * So the bundle is assembled here instead, from Plotly's own à-la-carte entry
 * points, and `next.config.mjs` aliases `plotly.js/dist/plotly` to this module
 * so that `react-plotly.js` picks it up without being forked or patched.
 *
 * **The trace below is exactly what the figures use.** Adding another kind of
 * Plotly chart means registering it here too, or Plotly will refuse to draw it
 * at runtime with "Trace type not found" — a failure that no type-checker can
 * catch, because the trace name is a string in a Plotly `Data` object. The
 * mapping, so the next person can check it:
 *
 * | Trace     | Where it is drawn                                          |
 * |-----------|------------------------------------------------------------|
 * | `scatter` | AshbyMap (points, envelopes, index lines), PropertyChart    |
 *
 * D-80 moved every other figure to the MSDS SVG components in
 * `components/charts/` (bars, box plot, radar, parallel coordinates,
 * heatmap), and `bar`, `box`, `heatmap` and `scatterpolar` left this bundle
 * with them — each was checked unused by a repository-wide search first. The
 * two maps stay on Plotly because they need what MSDS's fixed SVG scatter does
 * not do: log–log axes, zoom and pan, and the box selection of the Chart Stage
 * (D-60).
 */

import Plotly from "plotly.js/lib/core";
import scatter from "plotly.js/lib/scatter";

Plotly.register([scatter]);

export default Plotly;
