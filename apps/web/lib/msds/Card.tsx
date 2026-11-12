// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Card. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Card
  // ---------------------------------------------------------------------
  function Card(props) {
    var variant = props.variant || "elevated";
    // Rodada 6, item 4 (elevação tonal): opt-in, e só quando variant="elevated"
    // — um Card "filled"/"outlined" é neutro de propósito e nunca ganha tint,
    // mesmo que o host passe tonalElevation por engano.
    var tonal = !!props.tonalElevation && variant === "elevated";
    return h("div", {
      className: ["msds-card", "msds-card-" + variant, props.className].filter(Boolean).join(" "),
      style: props.style,
      "data-interactive": props.interactive ? "true" : "false",
      "data-tonal-hover": props.tonalHover ? "true" : "false",
      "data-tonal-elevation": tonal ? "true" : "false"
    }, props.children);
  }

  function CardHeader(props) {
    return h("div", { className: "msds-card-header" },
      h("h3", { className: "msds-card-title" }, props.title),
      props.description ? h("p", { className: "msds-card-desc" }, props.description) : null
    );
  }

  function CardBody(props) { return h("div", { className: "msds-card-body" }, props.children); }

  function CardFooter(props) { return h("div", { className: "msds-card-footer" }, props.children); }
  Card.Header = CardHeader; Card.Body = CardBody; Card.Footer = CardFooter;

export { Card, CardBody, CardFooter, CardHeader };
