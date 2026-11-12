// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — StatTile. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { SPRING, useSpring } from "./motion";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // StatTile — KPI com contagem animada + sparkline.
  // ---------------------------------------------------------------------
  function useCountUp(target) {
    // Antes: curva cúbica escrita à mão. Agora: o mesmo primitivo do resto
    // do sistema — useSpring(effectsDefault), sem duplicar matemática.
    return useSpring(target, SPRING.effectsDefault, 0);
  }

  function Sparkline(props) {
    var data = props.data || [];
    if (!data.length) return null;
    var w = 120, hgt = 32, pad = 3;
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    var range = (max - min) || 1;
    var pts = data.map(function (v, i) {
      var x = pad + (i / (data.length - 1 || 1)) * (w - pad * 2);
      var y = hgt - pad - ((v - min) / range) * (hgt - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return h("svg", { className: "msds-stat-spark", viewBox: "0 0 " + w + " " + hgt, preserveAspectRatio: "none" },
      h("polyline", { points: pts, fill: "none", stroke: props.color || "var(--accent)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" })
    );
  }

  function StatTile(props) {
    var displayValue = useCountUp(props.value);
    var decimals = props.decimals || 0;
    return h("div", { className: "msds-stat" },
      h("div", { className: "msds-stat-label" }, props.label),
      h("div", null,
        h("span", { className: "msds-stat-value" }, displayValue.toFixed(decimals)),
        props.unit ? h("span", { className: "msds-stat-unit" }, props.unit) : null
      ),
      h("div", { className: "msds-stat-row" },
        h(Sparkline, { data: props.sparkline, color: props.accent || "var(--accent)" }),
        props.trend !== undefined ? h("span", { className: "msds-stat-trend", "data-dir": props.trend >= 0 ? "up" : "down" },
          (props.trend >= 0 ? "+" : "") + props.trend + "%"
        ) : null
      )
    );
  }

export { Sparkline, StatTile, useCountUp };
