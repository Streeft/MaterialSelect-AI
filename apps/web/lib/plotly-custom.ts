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
 * **The five traces below are exactly what the figures use.** Adding a sixth
 * kind of chart means registering it here too, or Plotly will refuse to draw it
 * at runtime with "Trace type not found" — a failure that no type-checker can
 * catch, because the trace name is a string in a Plotly `Data` object. The
 * mapping, so the next person can check it:
 *
 * | Trace          | Where it is drawn                                        |
 * |----------------|----------------------------------------------------------|
 * | `scatter`      | AshbyMap (points, envelopes, index lines), PropertyChart, |
 * |                | ComparisonView's parallel-coordinates view                |
 * | `bar`          | ComparisonView bars, ClassCoverageChart, QualityMixChart  |
 * | `box`          | PropertyDistributionPanel                                 |
 * | `scatterpolar` | ComparisonView radar                                      |
 * | `heatmap`      | ComparisonView heatmap                                    |
 *
 * Note that the parallel-coordinates view is a `scatter`, not Plotly's
 * `parcoords` — see the comment in `ComparisonView.tsx` for why. That is the
 * reason `parcoords` is absent here.
 */

import Plotly from "plotly.js/lib/core";
import bar from "plotly.js/lib/bar";
import box from "plotly.js/lib/box";
import heatmap from "plotly.js/lib/heatmap";
import scatter from "plotly.js/lib/scatter";
import scatterpolar from "plotly.js/lib/scatterpolar";

Plotly.register([bar, box, heatmap, scatter, scatterpolar]);

export default Plotly;
