// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — feedback. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";

const h = React.createElement;

  function Skeleton(props) {
    return h("div", { className: "msds-skeleton", style: { width: props.width || "100%", height: props.height || "14px" } });
  }

  function LoadingState(props) {
    return h("div", { className: "msds-col", style: { gap: "8px" }, role: "status", "aria-label": props.label || "Carregando" },
      h(Skeleton, { width: "60%", height: "18px" }), h(Skeleton, {}), h(Skeleton, { width: "80%" })
    );
  }

  function ErrorState(props) {
    return h("div", { className: "msds-state msds-state-error" },
      h("span", { className: "msds-state-icon", "aria-hidden": "true" }, msdsIcon("alert")),
      h("div", null, h("div", { className: "msds-state-title" }, props.title || "Não foi possível carregar"),
        props.description ? h("div", { className: "msds-state-desc" }, props.description) : null,
        props.action ? h("div", { style: { marginTop: "10px" } }, props.action) : null)
    );
  }

  function EmptyStateArt() {
    return h("svg", { width: 64, height: 64, viewBox: "0 0 64 64", "aria-hidden": "true" },
      h("rect", { x: 4, y: 4, width: 34, height: 34, rx: 10, fill: "var(--brand-100)" }),
      h("rect", { x: 30, y: 26, width: 30, height: 30, rx: 10, fill: "var(--brand-300)" }),
      h("circle", { cx: 46, cy: 14, r: 8, fill: "var(--accent)" })
    );
  }

  function EmptyState(props) {
    return h("div", { className: "msds-state" },
      EmptyStateArt(),
      h("div", null, h("div", { className: "msds-state-title" }, props.title || "Nada por aqui ainda"),
        props.description ? h("div", { className: "msds-state-desc" }, props.description) : null,
        props.action ? h("div", { style: { marginTop: "10px" } }, props.action) : null)
    );
  }

export { EmptyState, EmptyStateArt, ErrorState, LoadingState, Skeleton };
