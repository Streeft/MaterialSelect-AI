// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Tabs. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { useRipple, useScreenTransition } from "./motion";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  function TabButton(props) {
    var ripple = useRipple();
    return h("button", {
      role: "tab", "aria-selected": props.sel, tabIndex: props.sel ? 0 : -1, className: "msds-tab msds-ripple-host",
      "data-active": props.sel ? "true" : "false",
      onPointerDown: ripple.onPointerDown,
      onClick: props.onClick, onKeyDown: props.onKeyDown
    }, ripple.layer, props.children);
  }

  // Rodada 6, item 11: a troca de aba usa "fade through" (useScreenTransition)
  // — o conteúdo antigo desvanece, uma pausa breve, o novo desvanece entrando.
  // Trocar de aba não é navegação hierárquica (não há "de cima" nem "de baixo"
  // entre duas abas), por isso fade-through e não shared-axis (que fica para
  // o ScreenTransitionDemo, onde os passos são sequenciais).
  function Tabs(props) {
    var tabs = props.tabs || [];
    var active = props.value;
    var trans = useScreenTransition(active, { pattern: "fadeThrough" });
    function onKeyDown(e, i) {
      if (e.key === "ArrowRight") { var n = tabs[(i + 1) % tabs.length]; props.onChange && props.onChange(n.value); }
      if (e.key === "ArrowLeft") { var p = tabs[(i - 1 + tabs.length) % tabs.length]; props.onChange && props.onChange(p.value); }
    }
    return h("div", { className: "msds-col", style: { gap: 0 } },
      h("div", { role: "tablist", "aria-label": props.label, className: "msds-tablist" },
        tabs.map(function (t, i) {
          var sel = t.value === active;
          return h(TabButton, {
            key: t.value, sel: sel,
            onClick: function () { props.onChange && props.onChange(t.value); },
            onKeyDown: function (e) { onKeyDown(e, i); }
          }, t.label);
        })
      ),
      h("div", { role: "tabpanel", className: "msds-tabpanel", style: trans.style }, (tabs.filter(function (t) { return t.value === trans.key; })[0] || {}).content)
    );
  }

export { TabButton, Tabs };
