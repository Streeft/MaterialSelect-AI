// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — RangeFilter. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;

  // RangeFilter — o controle mais específico deste produto: definir um
  // limite numérico sobre uma propriedade, com o histograma do catálogo
  // como fundo (nunca inventado — vem pronto por prop).
  function RangeFilter(props) {
    var min = props.min, max = props.max;
    var histogram = props.histogram || [];
    var maxCount = Math.max.apply(null, histogram.concat([1]));
    return h("div", { className: "msds-rangefilter" },
      h("div", { className: "msds-field-label" }, props.label),
      h("div", { className: "msds-rangefilter-track" },
        h("div", { className: "msds-rangefilter-hist" },
          histogram.map(function (c, i) {
            return h("div", { key: i, className: "msds-rangefilter-bar", style: { height: (8 + (c / maxCount) * 26) + "px" } });
          })
        ),
        h("div", {
          className: "msds-rangefilter-fill",
          style: {
            left: (((props.valueMin - min) / (max - min)) * 100) + "%",
            right: ((1 - (props.valueMax - min) / (max - min)) * 100) + "%"
          }
        }),
        h("input", {
          type: "range", className: "msds-rangefilter-input", min: min, max: max, value: props.valueMin,
          onChange: function (e) { var v = Math.min(Number(e.target.value), props.valueMax); props.onChange && props.onChange(v, props.valueMax); }
        }),
        h("input", {
          type: "range", className: "msds-rangefilter-input", min: min, max: max, value: props.valueMax,
          onChange: function (e) { var v = Math.max(Number(e.target.value), props.valueMin); props.onChange && props.onChange(props.valueMin, v); }
        })
      ),
      h("div", { className: "msds-rangefilter-values" },
        h("span", null, props.valueMin, " ", props.unit || ""),
        h("span", null, props.valueMax, " ", props.unit || "")
      )
    );
  }

export { RangeFilter };
