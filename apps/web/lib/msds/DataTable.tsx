// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — DataTable. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // DataTable — tabela genérica reusável: colunas declaram render próprio
  // por célula (evita cada tela reinventar <table> a mão, a razão de o
  // pedido existir).
  // ---------------------------------------------------------------------
  function DataTable(props) {
    var columns = props.columns || [];
    var rows = props.rows || [];
    var getRowKey = props.rowKey || function (row, i) { return row.id !== undefined ? row.id : i; };
    return h("div", { className: "msds-datatable-wrap" },
      h("table", { className: "msds-datatable", "aria-label": props.title },
        h("thead", null, h("tr", null,
          columns.map(function (col) {
            return h("th", { key: col.key, "data-numeric": col.numeric ? "true" : "false" }, col.label);
          })
        )),
        h("tbody", null,
          rows.length ? rows.map(function (row, ri) {
            return h("tr", { key: getRowKey(row, ri) },
              columns.map(function (col) {
                var content = col.render ? col.render(row, ri) : row[col.key];
                return h("td", { key: col.key, "data-numeric": col.numeric ? "true" : "false" }, content);
              })
            );
          }) : h("tr", null, h("td", { colSpan: columns.length, className: "msds-datatable-empty" }, props.emptyLabel || "Nenhum registro."))
        )
      )
    );
  }

export { DataTable };
