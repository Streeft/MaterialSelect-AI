// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — SplitButton. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { Menu } from "./Menu";
import { useRipple } from "./motion";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // SplitButton — Rodada 6, item 8: ação padrão (onClick) + um segundo alvo
  // (seta) que abre um Menu (reaproveita o Menu da Rodada 4) com as ações
  // alternativas. Visualmente dois segmentos de um botão só, com uma linha
  // divisória fina (token "edge", não uma cor nova) entre eles — os dois
  // cliques são independentes: clicar no rótulo nunca abre o menu, e
  // abrir o menu nunca dispara a ação padrão.
  // ---------------------------------------------------------------------
  function SplitButton(props) {
    var variant = props.variant || "primary";
    var ripple = useRipple();
    return h("div", { className: "msds-splitbtn msds-splitbtn-" + variant },
      h("button", {
        type: "button", className: "msds-splitbtn-main msds-ripple-host", disabled: props.disabled,
        onPointerDown: ripple.onPointerDown, onClick: props.onClick
      }, ripple.layer, props.children),
      h("span", { className: "msds-splitbtn-divider", "aria-hidden": "true" }),
      h(Menu, {
        trigger: h("span", { className: "msds-splitbtn-caret", "aria-label": props.menuLabel || "Mais ações" }, msdsIcon("chevronDown")),
        items: props.items
      })
    );
  }

export { SplitButton };
