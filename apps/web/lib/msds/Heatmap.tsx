// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Heatmap. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // Heatmap — grade de correlação; a cor reaproveita a rampa brand como
  // escala sequencial de dado (não é a mesma leitura que a marca faz
  // dela na interface, mas evita inventar uma segunda rampa de cor).
  // ---------------------------------------------------------------------
  var HEATMAP_STEPS = ["var(--surface-300)", "var(--brand-100)", "var(--brand-200)", "var(--brand-300)", "var(--brand-500)", "var(--brand-600)", "var(--brand-700)", "var(--brand-800)", "var(--brand-900)"];

  function heatColor(v) {
    var i = Math.round(Math.max(0, Math.min(1, v)) * (HEATMAP_STEPS.length - 1));
    return HEATMAP_STEPS[i];
  }

  function Heatmap(props) {
    var rowsLabels = props.rows || [], colsLabels = props.cols || [], values = props.values || [];
    var hs = useState(null); var hover = hs[0], setHover = hs[1];
    var cellSize = 44;
    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" }, h("h4", { className: "msds-chart-title" }, props.title)),
      h("div", { role: "img", "aria-label": (props.title || "Mapa de correlação") + ", " + rowsLabels.length + " linhas por " + colsLabels.length + " colunas." },
        h("div", { style: { overflowX: "auto" } },
          h("div", { style: { display: "grid", gridTemplateColumns: "110px repeat(" + colsLabels.length + ", " + cellSize + "px)", gap: "3px", alignItems: "center" } },
            [h("div", { key: "corner" })].concat(colsLabels.map(function (c) {
              return h("div", { key: "col-" + c, style: { fontSize: "11px", color: "var(--ink-subtle)", textAlign: "center" } }, c);
            })),
            rowsLabels.map(function (r, ri) {
              return [h("div", { key: "row-" + r, style: { fontSize: "12px", color: "var(--ink-muted)" } }, r)].concat(
                colsLabels.map(function (c, ci) {
                  var v = (values[ri] || [])[ci];
                  var key = ri + "-" + ci;
                  var active = hover === key;
                  return h("div", {
                    key: key, tabIndex: 0, className: "msds-heat-cell", "data-active": active ? "true" : "false",
                    style: { width: cellSize + "px", height: cellSize + "px", background: v == null ? "var(--surface-300)" : heatColor(v) },
                    "aria-label": r + " × " + c + ": " + (v == null ? "sem dado" : v.toFixed(2)),
                    onMouseEnter: function () { setHover(key); }, onMouseLeave: function () { setHover(null); },
                    onFocus: function () { setHover(key); }, onBlur: function () { setHover(null); }
                  }, active && v != null ? h("span", { className: "msds-heat-value" }, v.toFixed(2)) : null);
                })
              );
            })
          )
        )
      ),
      h("div", { className: "msds-heat-scale" },
        h("span", null, "0"),
        HEATMAP_STEPS.map(function (c, i) { return h("span", { key: i, className: "msds-heat-swatch", style: { background: c } }); }),
        h("span", null, "1")
      )
    );
  }

export { HEATMAP_STEPS, Heatmap, heatColor };
