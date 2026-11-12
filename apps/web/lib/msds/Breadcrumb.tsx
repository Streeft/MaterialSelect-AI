// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Breadcrumb. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------
  function Breadcrumb(props) {
    var items = props.items || [];
    return h("nav", { "aria-label": "Trilha de navegação", className: "msds-breadcrumb" },
      items.map(function (it, i) {
        var last = i === items.length - 1;
        return h(React.Fragment, { key: i },
          last ? h("span", { "aria-current": "page", className: "msds-breadcrumb-current" }, it.label)
            : h("a", { href: "#", className: "msds-breadcrumb-link", onClick: function (e) { e.preventDefault(); it.onClick && it.onClick(); } }, it.label),
          !last ? h("span", { "aria-hidden": "true", className: "msds-breadcrumb-sep" }, "/") : null
        );
      })
    );
  }

export { Breadcrumb };
