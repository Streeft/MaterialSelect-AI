// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — RadarChart. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { SPRING, useSpring } from "./motion";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // RadarChart — comparação de materiais, entrada animada, série que
  // se pode ocultar pela legenda.
  // ---------------------------------------------------------------------
  function polarPoint(cx, cy, r, angle) { return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]; }

  // Uma série é um componente próprio para que cada uma carregue a sua
  // própria mola: uma série nova (key nova) nasce em 0 e assenta em 1 —
  // "aparece do nada" deixa de acontecer por construção, nunca por um
  // ajuste de timing na demo que a usa. A mesma mola serve para
  // ligar/desligar pela legenda (o alvo vira 0, ela recolhe e desvanece).
  function RadarSeriesPolygon(props) {
    var presence = useSpring(props.isOff ? 0 : 1, SPRING.spatialDefault, 0);
    var pts = props.axes.map(function (a, i) { return polarPoint(props.cx, props.cy, props.R * (props.series.values[a.key] || 0), props.angleFor(i)); });
    var pointsAttr = pts.map(function (p) { return p.join(","); }).join(" ");
    return h("polygon", {
      points: pointsAttr, className: "msds-radar-series",
      fill: props.series.color, stroke: props.series.color, strokeWidth: 2,
      style: { opacity: Math.max(0, presence), transform: "scale(" + Math.max(0.001, presence) + ")", transformOrigin: props.cx + "px " + props.cy + "px" }
    });
  }

  function RadarChart(props) {
    var axes = props.axes || [];
    var series = props.series || [];
    var os = useState({}); var off = os[0], setOff = os[1];
    var hs = useState(null); var hoverAxis = hs[0], setHoverAxis = hs[1];

    var size = 320, cx = size / 2, cy = size / 2, R = size / 2 - 64;
    var n = axes.length || 1;
    function angleFor(i) { return -Math.PI / 2 + i * (2 * Math.PI / n); }

    var rings = [0.25, 0.5, 0.75, 1].map(function (f) {
      var pts = axes.map(function (a, i) { return polarPoint(cx, cy, R * f, angleFor(i)); });
      return h("polygon", { key: f, points: pts.map(function (p) { return p.join(","); }).join(" "), fill: "none", stroke: "var(--edge)", strokeWidth: 1 });
    });

    var axisLines = axes.map(function (a, i) {
      var p = polarPoint(cx, cy, R, angleFor(i));
      var lp = polarPoint(cx, cy, R + 22, angleFor(i));
      var anchor = Math.abs(lp[0] - cx) < 4 ? "middle" : (lp[0] > cx ? "start" : "end");
      return h("g", { key: a.key },
        h("line", { x1: cx, y1: cy, x2: p[0], y2: p[1], stroke: "var(--edge)", strokeWidth: 1 }),
        h("text", { x: lp[0], y: lp[1], textAnchor: anchor, dominantBaseline: "middle", className: "msds-radar-axis-label", fontWeight: hoverAxis === a.key ? 700 : 400 }, a.label)
      );
    });

    var seriesEls = series.map(function (s) {
      return h(RadarSeriesPolygon, { key: s.name, series: s, isOff: !!off[s.name], axes: axes, cx: cx, cy: cy, R: R, angleFor: angleFor });
    });

    var vertexEls = [];
    series.forEach(function (s) {
      if (off[s.name]) return;
      axes.forEach(function (a, i) {
        var p = polarPoint(cx, cy, R * (s.values[a.key] || 0), angleFor(i));
        vertexEls.push(h("circle", {
          key: s.name + "-" + a.key, cx: p[0], cy: p[1], r: 3.5, fill: s.color, className: "msds-radar-vertex",
          onMouseEnter: function () { setHoverAxis(a.key); }, onMouseLeave: function () { setHoverAxis(null); }
        }));
      });
    });

    var legend = h("div", { className: "msds-legend" },
      series.map(function (s) {
        return h("button", {
          key: s.name, className: "msds-legend-item", "data-off": off[s.name] ? "true" : "false",
          onClick: function () { var next = Object.assign({}, off); next[s.name] = !off[s.name]; setOff(next); }
        }, h("span", { className: "msds-legend-swatch", style: { background: s.color } }), s.name);
      })
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" }, h("h4", { className: "msds-chart-title" }, props.title)),
      h("div", { role: "img", "aria-label": (props.title || "Radar de comparação") + ". Eixos: " + axes.map(function (a) { return a.label; }).join(", ") + "." },
        h("svg", { viewBox: "0 0 " + size + " " + size, style: { width: "100%", maxWidth: "360px", height: "auto", display: "block", margin: "0 auto", overflow: "visible" } },
          rings, axisLines, seriesEls, vertexEls
        )
      ),
      legend
    );
  }

export { RadarChart, RadarSeriesPolygon, polarPoint };
