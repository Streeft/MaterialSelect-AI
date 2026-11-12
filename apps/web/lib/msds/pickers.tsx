// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — pickers. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { IconButton } from "./Button";
import { Popover } from "./Popover";
import { FieldShell } from "./fields";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // DatePicker / TimePicker — Rodada 6, item 9. Puro JS de calendário (sem
  // parsing de fuso horário, sem biblioteca de datas — D-23), abrindo num
  // Popover ancorado no controle, mesmo padrão do Select/Menu.
  // ---------------------------------------------------------------------
  var MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  var WEEKDAYS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];

  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  function sameDay(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function DatePicker(props) {
    var value = props.value instanceof Date ? props.value : null;
    var vs = useState(function () { return { y: (value || new Date()).getFullYear(), m: (value || new Date()).getMonth() }; });
    var view = vs[0], setView = vs[1];
    var leading = new Date(view.y, view.m, 1).getDay();
    var total = daysInMonth(view.y, view.m);
    var cells = [];
    for (var i = 0; i < leading; i++) cells.push(null);
    for (var d = 1; d <= total; d++) cells.push(d);
    function go(delta) {
      var m = view.m + delta, y = view.y;
      if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
      setView({ y: y, m: m });
    }
    var label = value ? pad2(value.getDate()) + " de " + MONTHS_PT[value.getMonth()] + " de " + value.getFullYear() : (props.placeholder || "Selecionar data");
    return h(FieldShell, {
      label: props.label,
      render: function (uid) {
        return h(Popover, {
          trigger: h("span", { className: "msds-datepicker-trigger-inner" }, msdsIcon("calendar"), h("span", null, label)),
          children: h("div", { className: "msds-datepicker" },
            h("div", { className: "msds-datepicker-nav" },
              h(IconButton, { variant: "standard", label: "Mês anterior", pressed: false, iconOff: "chevronLeft", iconOn: "chevronLeft", onToggle: function () { go(-1); } }),
              h("span", { className: "msds-datepicker-month" }, MONTHS_PT[view.m] + " de " + view.y),
              h(IconButton, { variant: "standard", label: "Próximo mês", pressed: false, iconOff: "chevronRight", iconOn: "chevronRight", onToggle: function () { go(1); } })
            ),
            h("div", { className: "msds-datepicker-grid msds-datepicker-weekdays" }, WEEKDAYS_PT.map(function (w, i) { return h("span", { key: i }, w); })),
            h("div", { className: "msds-datepicker-grid" }, cells.map(function (d, i) {
              if (d === null) return h("span", { key: i, className: "msds-datepicker-cell is-empty" });
              var cellDate = new Date(view.y, view.m, d);
              var sel = sameDay(cellDate, value);
              var today = sameDay(cellDate, new Date());
              return h("button", {
                key: i, type: "button", className: "msds-datepicker-cell", "data-selected": sel ? "true" : "false", "data-today": today ? "true" : "false",
                onClick: function () { props.onChange && props.onChange(cellDate); }
              }, d);
            }))
          )
        });
      }
    });
  }

  function TimePicker(props) {
    var value = props.value || { hour: 0, minute: 0 };
    function clamp(n, max) { return ((n % max) + max) % max; }
    function set(hour, minute) { props.onChange && props.onChange({ hour: clamp(hour, 24), minute: clamp(minute, 60) }); }
    function field(unit, max, step) {
      var v = unit === "hour" ? value.hour : value.minute;
      return h("div", { className: "msds-timepicker-field" },
        h("button", { type: "button", className: "msds-timepicker-step", "aria-label": "Aumentar " + (unit === "hour" ? "hora" : "minuto"), onClick: function () { unit === "hour" ? set(value.hour + step, value.minute) : set(value.hour, value.minute + step); } }, msdsIcon("plus")),
        h("input", {
          className: "msds-control msds-timepicker-input", type: "number", inputMode: "numeric", min: 0, max: max - 1,
          value: pad2(v),
          onChange: function (e) {
            var n = Number(e.target.value);
            if (isNaN(n)) return;
            unit === "hour" ? set(n, value.minute) : set(value.hour, n);
          }
        }),
        h("button", { type: "button", className: "msds-timepicker-step", "aria-label": "Diminuir " + (unit === "hour" ? "hora" : "minuto"), onClick: function () { unit === "hour" ? set(value.hour - step, value.minute) : set(value.hour, value.minute - step); } }, msdsIcon("minus"))
      );
    }
    return h(FieldShell, {
      label: props.label,
      render: function () {
        return h("div", { className: "msds-timepicker" },
          msdsIcon("clock"),
          field("hour", 24, 1),
          h("span", { className: "msds-timepicker-sep", "aria-hidden": "true" }, ":"),
          field("minute", 60, 5)
        );
      }
    });
  }

export { DatePicker, MONTHS_PT, TimePicker, WEEKDAYS_PT, daysInMonth, pad2, sameDay };
