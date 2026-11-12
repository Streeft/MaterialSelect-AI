// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — LinearProgress. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { prefersReducedMotion } from "./runtime";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Estados: carregando, erro, vazio.
  // ---------------------------------------------------------------------
  // LinearProgress — determinado (value 0-100) ou indeterminado (sem value,
  // varredura contínua em CSS). A varredura para de verdade sob
  // prefers-reduced-motion — não só desacelera — porque um indicador
  // "quase parado" ainda lê como movimento contínuo para quem pediu menos.
  function LinearProgress(props) {
    var determinate = props.value !== undefined && props.value !== null;
    var pct = determinate ? Math.max(0, Math.min(100, props.value)) : null;
    var reduced = prefersReducedMotion();
    return h("div", {
      className: "msds-linprog", role: "progressbar",
      "aria-valuenow": determinate ? pct : undefined,
      "aria-valuemin": 0, "aria-valuemax": 100,
      "aria-label": props.label || "Carregando", "aria-busy": !determinate || undefined
    },
      h("div", { className: "msds-linprog-track" },
        determinate ? h("div", { className: "msds-linprog-fill", style: { width: pct + "%" } })
          : reduced ? h("div", { className: "msds-linprog-fill", style: { width: "40%" } })
            : h("div", { className: "msds-linprog-sweep" })
      )
    );
  }

export { LinearProgress };
