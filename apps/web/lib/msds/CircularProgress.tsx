// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — CircularProgress. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // CircularProgress — Rodada 6, item 5: par do LinearProgress (Rodada 5).
  // Determinado (com "value", 0–100) desenha o arco proporcional via
  // stroke-dasharray/dashoffset; indeterminado (sem "value") gira
  // continuamente por @keyframes, parado sob prefers-reduced-motion — mesma
  // disciplina do LinearProgress. O spinner interno de Button (state=
  // "loading") continua próprio e separado: é pequeno e monocromático
  // (currentColor, sem trilho), enquanto este é maior, com trilho de fundo
  // e cor de marca — papéis diferentes, então ficam como dois desenhos.
  // ---------------------------------------------------------------------
  function CircularProgress(props) {
    var size = props.size || 48;
    var stroke = props.strokeWidth || 4;
    var r = (size - stroke) / 2;
    var circumference = 2 * Math.PI * r;
    var determinate = typeof props.value === "number";
    var pct = determinate ? Math.max(0, Math.min(100, props.value)) : 0;
    var offset = circumference * (1 - pct / 100);
    return h("span", {
      className: "msds-circprog" + (determinate ? "" : " is-indeterminate"),
      style: { width: size + "px", height: size + "px" },
      role: "progressbar",
      "aria-label": props.label,
      "aria-valuenow": determinate ? Math.round(pct) : undefined,
      "aria-valuemin": determinate ? 0 : undefined,
      "aria-valuemax": determinate ? 100 : undefined
    },
      h("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, className: "msds-circprog-svg" },
        h("circle", { className: "msds-circprog-track", cx: size / 2, cy: size / 2, r: r, strokeWidth: stroke, fill: "none" }),
        h("circle", {
          className: "msds-circprog-fill", cx: size / 2, cy: size / 2, r: r, strokeWidth: stroke, fill: "none",
          strokeDasharray: determinate ? circumference : circumference * 0.72 + " " + circumference,
          strokeDashoffset: determinate ? offset : 0,
          strokeLinecap: "round"
        })
      ),
      determinate && props.showValue !== false ? h("span", { className: "msds-circprog-value" }, Math.round(pct) + "%") : null
    );
  }

export { CircularProgress };
