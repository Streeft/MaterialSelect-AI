// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — ComparisonTray. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { Button } from "./Button";
import { prefersReducedMotion } from "./runtime";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // ComparisonTray — bandeja flutuante que acumula materiais.
  // Assinatura #2.
  // ---------------------------------------------------------------------
  function ComparisonTray(props) {
    var items = props.items || [];
    // Mantém a última lista não-vazia visível durante a saída (M3: quem sai
    // acelera, não some no mesmo frame) — só então desmonta de verdade.
    var ds = useState(items); var displayItems = ds[0], setDisplayItems = ds[1];
    var ls = useState(false); var leaving = ls[0], setLeaving = ls[1];
    useEffect(function () {
      if (items.length > 0) {
        setDisplayItems(items);
        setLeaving(false);
      } else if (displayItems.length > 0) {
        if (prefersReducedMotion()) { setDisplayItems([]); return; }
        setLeaving(true);
        var t = setTimeout(function () { setDisplayItems([]); setLeaving(false); }, 160);
        return function () { clearTimeout(t); };
      }
    }, [items]);
    if (!displayItems.length) return null;
    return h("div", { className: "msds-tray" + (leaving ? " is-leaving" : "") },
      h("div", { className: "msds-tray-items" },
        displayItems.map(function (it) {
          return h("span", { key: it.id, className: "msds-tray-chip" },
            h("span", { className: "msds-chip-dot", style: { background: it.color } }), it.label,
            h("button", { "aria-label": "Remover " + it.label, className: "msds-tray-remove", onClick: function () { props.onRemove && props.onRemove(it.id); } }, msdsIcon("close"))
          );
        })
      ),
      h(Button, { variant: "primary", size: "sm", disabled: displayItems.length < 2, onClick: props.onCompare }, "Comparar " + displayItems.length + (displayItems.length === 1 ? " material" : " materiais"))
    );
  }

export { ComparisonTray };
