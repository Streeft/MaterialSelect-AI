// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Chip. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { useRipple, useShapeMorph } from "./motion";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Chip — multi-select filter (e.g. classes num mapa). Rodada 6: forma
  // expressive — a pílula (radius-full) morfa para 8px (radius-seat) ao
  // selecionar, e volta ao desselecionar; o alvo é o estado de seleção,
  // não o ponteiro (diferente de Button/IconButton/FAB, que respondem à
  // pressão — o Chip "assist"/"suggestion" sem seleção nunca morfa).
  // ---------------------------------------------------------------------
  function Chip(props) {
    var variant = props.variant || "filter";
    var ripple = useRipple();
    var morph = useShapeMorph(9999, 8, !!props.selected);
    var cls = ["msds-chip", "msds-ripple-host", "msds-chip-" + variant, props.className].filter(Boolean).join(" ");
    var body = [
      ripple.layer,
      variant === "assist" && props.icon ? h("span", { className: "msds-chip-icon", key: "icon" }, msdsIcon(props.icon)) : null,
      props.color ? h("span", { className: "msds-chip-dot", style: { background: props.color }, key: "dot" }) : null,
      h("span", { className: "msds-chip-text", key: "text" }, props.children)
    ];
    // Chip "input" tem duas ações independentes (selecionar/remover), então não
    // pode ser um único <button> — um botão não pode conter outro botão. Vira
    // um contêiner com role="button" para a seleção, mais um <button> real só
    // para o "x"; os dois nunca são o mesmo elemento clicável.
    if (variant === "input") {
      return h("span", {
        className: cls, role: props.onClick ? "button" : undefined, tabIndex: props.onClick ? 0 : undefined,
        style: morph.style,
        "aria-pressed": props.onClick ? !!props.selected : undefined,
        onPointerDown: props.onClick ? ripple.onPointerDown : undefined,
        onClick: props.onClick,
        onKeyDown: props.onClick ? function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onClick(); } } : undefined
      },
        body,
        h("button", {
          type: "button", className: "msds-chip-remove", "aria-label": (props.removeLabel || "Remover") + (typeof props.children === "string" ? " " + props.children : ""),
          onClick: function (e) { e.stopPropagation(); props.onRemove && props.onRemove(); }
        }, msdsIcon("close"))
      );
    }
    return h("button", {
      type: "button", className: cls, style: morph.style, "aria-pressed": !!props.selected,
      onPointerDown: ripple.onPointerDown, onClick: props.onClick
    }, body);
  }

export { Chip };
