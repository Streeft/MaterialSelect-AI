// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — BoxPlot. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { ButtonGroup } from "./Button";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // BoxPlot — distribuição por propriedade; quartis já vêm prontos
  // (nunca recalculados aqui), uma caixa por classe.
  // ---------------------------------------------------------------------
  function BoxPlot(props) {
    var data = props.data || [];
    var hs = useState(null); var hover = hs[0], setHover = hs[1];
    var ts = useState(false); var showTable = ts[0], setShowTable = ts[1];
    var ls = useState("linear"); var scaleMode = ls[0], setScaleMode = ls[1];

    var lo = Math.min.apply(null, data.map(function (d) { return d.whiskerLow; }));
    var hi = Math.max.apply(null, data.map(function (d) { return d.whiskerHigh; }));
    var canLog = props.allowLog !== false && lo > 0;
    var useLog = scaleMode === "log" && canLog;
    function scale(v) {
      var a = useLog ? Math.log(lo) : lo, b = useLog ? Math.log(hi) : hi, x = useLog ? Math.log(v) : v;
      return ((x - a) / ((b - a) || 1)) * 100;
    }

    var rows = data.map(function (row) {
      var active = hover === row.label;
      return h("div", { className: "msds-box-row", key: row.label },
        h("span", { className: "msds-bar-name" }, row.label),
        h("div", {
          className: "msds-box-track", tabIndex: 0, "data-active": active ? "true" : "false",
          "aria-label": row.label + ": mínimo " + row.whiskerLow + ", Q1 " + row.q1 + ", mediana " + row.median + ", Q3 " + row.q3 + ", máximo " + row.whiskerHigh,
          onMouseEnter: function () { setHover(row.label); }, onMouseLeave: function () { setHover(null); },
          onFocus: function () { setHover(row.label); }, onBlur: function () { setHover(null); }
        },
          h("div", { className: "msds-box-whisker", style: { left: scale(row.whiskerLow) + "%", width: (scale(row.whiskerHigh) - scale(row.whiskerLow)) + "%" } }),
          h("div", { className: "msds-box-box", style: { left: scale(row.q1) + "%", width: (scale(row.q3) - scale(row.q1)) + "%", background: row.color } }),
          h("div", { className: "msds-box-median", style: { left: scale(row.median) + "%" } })
        )
      );
    });

    var info = hover ? (function () {
      var row = data.filter(function (d) { return d.label === hover; })[0];
      return h("div", { style: { fontSize: "12px", color: "var(--ink)", marginTop: "8px" }, "aria-live": "polite" },
        h("strong", null, row.label), " — mín ", row.whiskerLow, " · Q1 ", row.q1, " · mediana ", h("strong", null, row.median), " · Q3 ", row.q3, " · máx ", row.whiskerHigh, " ", props.unit || ""
      );
    })() : h("div", { style: { height: "18px" } });

    var table = h("table", { className: "msds-chart-table" },
      h("thead", null, h("tr", null, h("th", null, "Classe"), h("th", { "data-numeric": "true" }, "Mín"), h("th", { "data-numeric": "true" }, "Q1"), h("th", { "data-numeric": "true" }, "Mediana"), h("th", { "data-numeric": "true" }, "Q3"), h("th", { "data-numeric": "true" }, "Máx"))),
      h("tbody", null, data.map(function (row) {
        return h("tr", { key: row.label }, h("td", null, row.label), h("td", { "data-numeric": "true" }, row.whiskerLow), h("td", { "data-numeric": "true" }, row.q1), h("td", { "data-numeric": "true" }, row.median), h("td", { "data-numeric": "true" }, row.q3), h("td", { "data-numeric": "true" }, row.whiskerHigh));
      }))
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" },
        h("h4", { className: "msds-chart-title" }, props.title),
        h("div", { className: "msds-row", style: { gap: "8px" } },
          canLog ? h(ButtonGroup, { value: scaleMode, onChange: setScaleMode, label: "Escala", options: [{ value: "linear", label: "Linear" }, { value: "log", label: "Log" }] }) : null,
          h("button", { className: "msds-table-toggle", onClick: function () { setShowTable(!showTable); } }, showTable ? "Ver gráfico" : "Ver tabela de dados")
        )
      ),
      showTable ? table : h("div", { role: "img", "aria-label": (props.title || "Distribuição por classe") + ". A tabela de dados equivalente está disponível pelo botão “Ver tabela de dados”." }, rows, info)
    );
  }

export { BoxPlot };
