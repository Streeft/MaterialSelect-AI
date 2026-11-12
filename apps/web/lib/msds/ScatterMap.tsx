// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — ScatterMap. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // ScatterMap — mapa de seleção estilo Ashby: envelopes de classe,
  // pontos com marcador+cor redundantes (Okabe–Ito) e reta de índice.
  // ---------------------------------------------------------------------
  function scaleLinear(domain, range) {
    var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
    return function (v) { return r0 + (v - d0) / ((d1 - d0) || 1) * (r1 - r0); };
  }

  function polygonPath(points) {
    if (!points || points.length < 3) return null;
    return "M" + points.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L") + "Z";
  }

  function Marker(x, y, r, symbol, color) {
    var common = { fill: color, stroke: "rgba(0,0,0,0.25)", strokeWidth: 1 };
    switch (symbol) {
      case "square": return h("rect", Object.assign({ x: x - r * 0.8, y: y - r * 0.8, width: r * 1.6, height: r * 1.6 }, common));
      case "diamond": return h("rect", Object.assign({ x: x - r * 0.72, y: y - r * 0.72, width: r * 1.44, height: r * 1.44, transform: "rotate(45 " + x + " " + y + ")" }, common));
      case "triangle": return h("polygon", Object.assign({ points: [[x, y - r], [x + r * 0.95, y + r * 0.8], [x - r * 0.95, y + r * 0.8]].map(function (p) { return p.join(","); }).join(" ") }, common));
      case "x": return h("g", null,
        h("line", { x1: x - r, y1: y - r, x2: x + r, y2: y + r, stroke: color, strokeWidth: 2.4, strokeLinecap: "round" }),
        h("line", { x1: x - r, y1: y + r, x2: x + r, y2: y - r, stroke: color, strokeWidth: 2.4, strokeLinecap: "round" })
      );
      default: return h("circle", Object.assign({ cx: x, cy: y, r: r }, common));
    }
  }

  function ScatterMap(props) {
    var points = props.points || [];
    var envelopesData = props.envelopes || [];
    var W = 640, H = 360, PAD = 40;
    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    var xDomain = [Math.min.apply(null, xs) * 0.9, Math.max.apply(null, xs) * 1.08];
    var yDomain = [Math.min.apply(null, ys) * 0.85, Math.max.apply(null, ys) * 1.12];
    var sx = scaleLinear(xDomain, [PAD, W - PAD]);
    var sy = scaleLinear(yDomain, [H - PAD, PAD]);

    var hs = useState(null); var hoverId = hs[0], setHoverId = hs[1];
    var ss = useState(null); var selId = ss[0], setSelId = ss[1];
    var os = useState({}); var off = os[0], setOff = os[1];
    var ts = useState(false); var showTable = ts[0], setShowTable = ts[1];

    var activeId = hoverId || selId;
    var activePoint = points.filter(function (p) { return p.id === activeId; })[0];

    var envelopeEls = envelopesData.map(function (env) {
      if (off[env.cls]) return null;
      var d = polygonPath(env.points.map(function (p) { return [sx(p[0]), sy(p[1])]; }));
      if (!d) return null;
      return h("path", { key: env.cls, className: "msds-scatter-envelope", d: d, fill: env.color, fillOpacity: 0.14, stroke: env.color, strokeOpacity: 0.5, strokeWidth: 1.5 });
    });

    var pointEls = points.map(function (p, i) {
      var cx = sx(p.x), cy = sy(p.y);
      var dim = off[p.cls] || (activeId && activeId !== p.id);
      return h("g", {
        key: p.id, className: "msds-scatter-point",
        "data-dim": dim ? "true" : "false", "data-active": activeId === p.id ? "true" : "false",
        style: { animation: "msds-fade-in 360ms both", animationDelay: (i * 18) + "ms" },
        tabIndex: 0, "aria-label": p.label + ", " + p.cls,
        onMouseEnter: function () { setHoverId(p.id); }, onMouseLeave: function () { setHoverId(null); },
        onFocus: function () { setHoverId(p.id); }, onBlur: function () { setHoverId(null); },
        onClick: function () { setSelId(selId === p.id ? null : p.id); }
      }, Marker(cx, cy, activeId === p.id ? 8 : 6, p.symbol, p.color));
    });

    var lineEl = null;
    if (props.indexLine) {
      var il = props.indexLine;
      var x1 = sx(il.x1), y1 = sy(il.y1), x2 = sx(il.x2), y2 = sy(il.y2);
      lineEl = h("g", null,
        h("line", { className: "msds-index-line", x1: x1, y1: y1, x2: x2, y2: y2, stroke: "var(--ink-subtle)", strokeWidth: 1.5 }),
        h("text", { x: x2, y: y2 - 8, textAnchor: "end", className: "msds-radar-axis-label" }, il.label)
      );
    }

    var classes = []; var seen = {};
    points.forEach(function (p) { if (!seen[p.cls]) { seen[p.cls] = true; classes.push(p); } });

    var legend = h("div", { className: "msds-legend" },
      classes.map(function (c) {
        return h("button", {
          key: c.cls, className: "msds-legend-item", "data-off": off[c.cls] ? "true" : "false",
          onClick: function () { var next = Object.assign({}, off); next[c.cls] = !off[c.cls]; setOff(next); }
        }, h("span", { className: "msds-legend-swatch", style: { background: c.color } }), c.cls);
      })
    );

    var tooltip = activePoint ? h("div", {
      className: "msds-tooltip",
      style: { left: (sx(activePoint.x) / W * 100) + "%", top: (sy(activePoint.y) / H * 100) + "%" }
    },
      h("div", null, activePoint.label),
      h("div", null, (props.xLabel || "X") + ": ", h("strong", null, activePoint.x)),
      h("div", null, (props.yLabel || "Y") + ": ", h("strong", null, activePoint.y))
    ) : null;

    var table = h("table", { className: "msds-chart-table" },
      h("thead", null, h("tr", null, h("th", null, "Material"), h("th", null, "Classe"), h("th", { "data-numeric": "true" }, props.xLabel), h("th", { "data-numeric": "true" }, props.yLabel))),
      h("tbody", null, points.map(function (p) {
        return h("tr", { key: p.id }, h("td", null, p.label), h("td", null, p.cls), h("td", { "data-numeric": "true" }, p.x), h("td", { "data-numeric": "true" }, p.y));
      }))
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" },
        h("h4", { className: "msds-chart-title" }, props.title),
        h("button", { className: "msds-table-toggle", onClick: function () { setShowTable(!showTable); } }, showTable ? "Ver gráfico" : "Ver tabela de dados")
      ),
      showTable ? table : h("div", { className: "msds-scatter-wrap", role: "img", "aria-label": (props.title || "Mapa de propriedades") + ". A tabela de dados equivalente está disponível pelo botão acima." },
        h("svg", { viewBox: "0 0 " + W + " " + H, style: { width: "100%", height: "auto", display: "block" } },
          h("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent" }),
          envelopeEls, lineEl, pointEls
        ),
        tooltip
      ),
      !showTable ? legend : null
    );
  }

export { Marker, ScatterMap, polygonPath, scaleLinear };
