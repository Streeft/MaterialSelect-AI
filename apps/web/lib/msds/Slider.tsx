// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Slider. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Slider — valor único contínuo (diferente do RangeFilter, que é faixa
  // dupla com histograma).
  // ---------------------------------------------------------------------
  function Slider(props) {
    var pct = ((props.value - props.min) / ((props.max - props.min) || 1)) * 100;
    return h("div", { className: "msds-slider" },
      props.label ? h("div", { className: "msds-field-label" }, props.label + (props.showValue === false ? "" : ": " + props.value + (props.unit || ""))) : null,
      h("div", { className: "msds-slider-track" },
        h("div", { className: "msds-slider-fill", style: { width: pct + "%" } }),
        h("input", {
          type: "range", className: "msds-slider-input", min: props.min, max: props.max, step: props.step,
          value: props.value, onChange: function (e) { props.onChange && props.onChange(Number(e.target.value)); }
        })
      )
    );
  }

export { Slider };
