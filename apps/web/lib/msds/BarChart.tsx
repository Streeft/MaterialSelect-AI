// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — BarChart. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // BarChart — barra horizontal empilhada, com informação de foco/hover
  // e alternativa textual (D-31): a tabela de dados nunca é opcional.
  // ---------------------------------------------------------------------
  function BarChart(props) {
    var data = props.data || [];
    var hs = useState(null); var hover = hs[0], setHover = hs[1];
    var ts = useState(false); var showTable = ts[0], setShowTable = ts[1];

    function rowTotal(row) { return row.segments.reduce(function (s, seg) { return s + seg.value; }, 0); }
    var maxTotal = 1;
    data.forEach(function (row) { maxTotal = Math.max(maxTotal, rowTotal(row)); });

    var bars = data.map(function (row, ri) {
      return h("div", { className: "msds-bar-row", key: row.label },
        h("span", { className: "msds-bar-name" }, row.label),
        h("div", { className: "msds-bar-track" },
          row.segments.map(function (seg, si) {
            var pct = (seg.value / maxTotal) * 100;
            var active = hover && hover.rowLabel === row.label && hover.seg.key === seg.key;
            return h("div", {
              key: seg.key, className: "msds-bar-seg",
              style: { width: pct + "%", background: seg.color, animationDelay: (ri * 70 + si * 50) + "ms" },
              "data-focus": active ? "true" : "false",
              tabIndex: 0,
              "aria-label": row.label + ": " + seg.label + " " + seg.value,
              onMouseEnter: function () { setHover({ rowLabel: row.label, seg: seg }); },
              onMouseLeave: function () { setHover(null); },
              onFocus: function () { setHover({ rowLabel: row.label, seg: seg }); },
              onBlur: function () { setHover(null); }
            });
          })
        )
      );
    });

    var info = hover
      ? h("div", { style: { fontSize: "12px", color: "var(--ink)", marginTop: "8px" }, "aria-live": "polite" },
        h("strong", null, hover.rowLabel), " — " + hover.seg.label + ": ",
        h("strong", null, hover.seg.value + (props.unit || ""))
      )
      : h("div", { style: { height: "18px" } });

    var table = h("table", { className: "msds-chart-table" },
      h("thead", null, h("tr", null,
        h("th", null, "Classe"),
        (props.segmentLabels || []).map(function (l) { return h("th", { key: l, "data-numeric": "true" }, l); })
      )),
      h("tbody", null, data.map(function (row) {
        return h("tr", { key: row.label },
          h("td", null, row.label),
          row.segments.map(function (seg) { return h("td", { key: seg.key, "data-numeric": "true" }, seg.value + (props.unit || "")); })
        );
      }))
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" },
        h("h4", { className: "msds-chart-title" }, props.title),
        h("button", { className: "msds-table-toggle", onClick: function () { setShowTable(!showTable); } }, showTable ? "Ver gráfico" : "Ver tabela de dados")
      ),
      showTable ? table : h("div", { role: "img", "aria-label": (props.title || "Gráfico de barras") + ". A tabela de dados equivalente está disponível pelo botão “Ver tabela de dados”." }, bars, info)
    );
  }

export { BarChart };
