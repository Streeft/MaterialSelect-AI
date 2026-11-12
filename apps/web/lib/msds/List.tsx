// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — List. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { useRipple } from "./motion";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // List / ListItem — linha estruturada (ícone/rótulo/meta), sem a
  // moldura inteira de um Card.
  // ---------------------------------------------------------------------
  function List(props) { return h("div", { className: "msds-list", role: "list" }, props.children); }

  function ListItem(props) {
    var ripple = useRipple();
    var clickable = !!props.onClick;
    return h("div", {
      className: "msds-list-item" + (clickable ? " msds-ripple-host" : ""),
      role: clickable ? "button" : "listitem", tabIndex: clickable ? 0 : undefined,
      onPointerDown: clickable ? ripple.onPointerDown : undefined,
      onClick: props.onClick,
      onKeyDown: clickable ? function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onClick(); } } : undefined
    },
      clickable ? ripple.layer : null,
      props.icon ? h("span", { className: "msds-list-icon" }, msdsIcon(props.icon)) : null,
      h("div", { className: "msds-list-body" },
        h("div", { className: "msds-list-label" }, props.label),
        props.description ? h("div", { className: "msds-list-desc" }, props.description) : null
      ),
      props.meta ? h("div", { className: "msds-list-meta" }, props.meta) : null
    );
  }

  // ---------------------------------------------------------------------
  // Divider
  // ---------------------------------------------------------------------
  function Divider(props) {
    return h("div", { className: "msds-divider" + (props.vertical ? " msds-divider-v" : ""), role: "separator", "aria-orientation": props.vertical ? "vertical" : "horizontal" });
  }

export { Divider, List, ListItem };
