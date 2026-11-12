// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — SearchBar. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // SearchBar — o campo que abre o CommandPalette, como superfície
  // própria embutível numa tela (não só atrás de ⌘K).
  // ---------------------------------------------------------------------
  function SearchBar(props) {
    return h("div", { className: "msds-searchbar" },
      msdsIcon("search"),
      h("input", { className: "msds-searchbar-input", placeholder: props.placeholder || "Buscar…", value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); }, "aria-label": props.label || "Buscar" }),
      props.value ? h("button", { className: "msds-searchbar-clear", "aria-label": "Limpar busca", onClick: function () { props.onChange && props.onChange(""); } }, msdsIcon("close")) : null
    );
  }

export { SearchBar };
