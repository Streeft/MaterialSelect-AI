// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Stepper. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Stepper — espelha a pilha de SelectionStage: cada etapa é uma
  // pergunta só.
  // ---------------------------------------------------------------------
  function Stepper(props) {
    var steps = props.steps || [];
    return h("ol", { className: "msds-stepper", "aria-label": props.label || "Etapas" },
      steps.map(function (s, i) {
        return h("li", { key: s.key, className: "msds-step", "data-state": s.state },
          h("span", { className: "msds-step-dot", "aria-hidden": "true" }, s.state === "complete" ? msdsIcon("check") : (i + 1)),
          h("div", { className: "msds-step-body" },
            h("div", { className: "msds-step-label" }, s.label),
            s.state === "blocked" && s.blockedReason ? h("div", { className: "msds-step-blocked" }, s.blockedReason) : null
          )
        );
      })
    );
  }

export { Stepper };
