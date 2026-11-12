// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — ParallelCoords. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // ParallelCoords — uma linha por material sobre eixos paralelos;
  // uma lacuna quebra a linha, nunca interpola (mesma regra do
  // ComparisonView real).
  // ---------------------------------------------------------------------
  function ParallelCoords(props) {
    var axes = props.axes || [], lines = props.lines || [];
    var W = 560, H = 320, PAD = 36, TOP = 20;
    var n = axes.length || 1;
    var xFor = function (i) { return PAD + i * ((W - PAD * 2) / (n - 1 || 1)); };
    var yFor = function (axis, v) {
      if (v == null) return null;
      return TOP + (1 - (v - axis.min) / ((axis.max - axis.min) || 1)) * (H - TOP * 2);
    };

    var hs = useState(null); var hoverId = hs[0], setHoverId = hs[1];
    var hax = useState(null); var hoverAxis = hax[0], setHoverAxis = hax[1];

    var axisEls = axes.map(function (a, i) {
      var x = xFor(i);
      return h("g", { key: a.key },
        h("line", { x1: x, y1: TOP, x2: x, y2: H - TOP, stroke: "var(--edge)", strokeWidth: hoverAxis === a.key ? 2 : 1 }),
        h("text", { x: x, y: H - TOP + 18, textAnchor: "middle", className: "msds-radar-axis-label" }, a.label),
        h("text", { x: x, y: TOP - 8, textAnchor: "middle", className: "msds-radar-axis-label" }, a.max),
        h("text", { x: x, y: H - TOP + 4, textAnchor: "middle", className: "msds-radar-axis-label" }, a.min)
      );
    });

    var lineEls = lines.map(function (ln) {
      var dim = hoverId && hoverId !== ln.id;
      // build segments, breaking on a missing value
      var segments = [], current = [];
      axes.forEach(function (a, i) {
        var y = yFor(a, ln.values[a.key]);
        if (y === null) {
          if (current.length > 1) segments.push(current);
          current = [];
        } else {
          current.push([xFor(i), y]);
        }
      });
      if (current.length > 1) segments.push(current);
      return h("g", { key: ln.id },
        segments.map(function (seg, si) {
          return h("polyline", {
            key: si, points: seg.map(function (p) { return p.join(","); }).join(" "),
            fill: "none", stroke: ln.color, strokeWidth: hoverId === ln.id ? 3 : 2,
            opacity: dim ? 0.15 : 0.9, strokeLinecap: "round", strokeLinejoin: "round"
          });
        }),
        axes.map(function (a, i) {
          var y = yFor(a, ln.values[a.key]);
          if (y === null) return null;
          return h("circle", {
            key: a.key, cx: xFor(i), cy: y, r: hoverId === ln.id ? 4.5 : 3, fill: ln.color, opacity: dim ? 0.2 : 1,
            onMouseEnter: function () { setHoverId(ln.id); setHoverAxis(a.key); },
            onMouseLeave: function () { setHoverId(null); setHoverAxis(null); }
          });
        })
      );
    });

    var legend = h("div", { className: "msds-legend" },
      lines.map(function (ln) {
        return h("button", {
          key: ln.id, className: "msds-legend-item",
          onMouseEnter: function () { setHoverId(ln.id); }, onMouseLeave: function () { setHoverId(null); }
        }, h("span", { className: "msds-legend-swatch", style: { background: ln.color } }), ln.label);
      })
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" }, h("h4", { className: "msds-chart-title" }, props.title)),
      h("div", { role: "img", "aria-label": (props.title || "Comparação de propriedades") + ". Eixos: " + axes.map(function (a) { return a.label; }).join(", ") + ". Uma lacuna interrompe a linha, nunca é interpolada." },
        h("svg", { viewBox: "0 0 " + W + " " + H, style: { width: "100%", height: "auto", display: "block" } }, axisEls, lineEls)
      ),
      legend
    );
  }

export { ParallelCoords };
