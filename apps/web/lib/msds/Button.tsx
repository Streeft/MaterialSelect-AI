// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Button. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { mergeHandlers, useRipple, useShapeMorph } from "./motion";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Button — Rodada 6: forma expressive M3 (raio de repouso "pill-ish" 12px
  // do token radius-control desce para 8px de radius-seat sob pressão e
  // volta ao soltar, via useShapeMorph/spatialFast).
  // ---------------------------------------------------------------------
  function Button(props) {
    var variant = props.variant || "primary";
    var size = props.size || "md";
    var state = props.state || (props.loading ? "loading" : "idle"); // "idle" | "loading" | "success"
    var loading = state === "loading";
    var success = state === "success";
    var disabled = !!props.disabled || loading;
    var ripple = useRipple();
    var morph = useShapeMorph(12, 8);
    var cls = ["msds-btn", "msds-ripple-host", "msds-btn-" + variant, "msds-btn-" + size, success ? "is-success" : "", props.className].filter(Boolean).join(" ");
    var rest = {};
    Object.keys(props).forEach(function (k) {
      if (["variant", "size", "loading", "state", "disabled", "className", "children", "onPointerDown", "onPointerUp", "onPointerLeave", "style"].indexOf(k) === -1) rest[k] = props[k];
    });
    rest.type = rest.type || "button";
    rest.disabled = disabled;
    rest.className = cls;
    rest.style = Object.assign({}, props.style, morph.style);
    rest.onPointerDown = function (e) { ripple.onPointerDown(e); morph.bind.onPointerDown(e); if (props.onPointerDown) props.onPointerDown(e); };
    rest.onPointerUp = mergeHandlers(props.onPointerUp, morph.bind.onPointerUp);
    rest.onPointerLeave = mergeHandlers(props.onPointerLeave, morph.bind.onPointerLeave);
    rest.onPointerCancel = morph.bind.onPointerCancel;
    if (loading) rest["aria-busy"] = true;
    var icon = loading ? h("span", { className: "msds-spinner", "aria-hidden": "true" })
      : success ? h("span", { className: "msds-btn-check", "aria-hidden": "true" }, msdsIcon("check")) : null;
    return h("button", rest, ripple.layer, icon, h("span", { className: "msds-btn-label" }, success && props.successLabel ? props.successLabel : props.children));
  }

  // ---------------------------------------------------------------------
  // IconButton — toggle affordance (aria-pressed), e.g. favoritar. Rodada 6:
  // forma expressive — círculo (radius-full) aperta para 16px sob pressão.
  // ---------------------------------------------------------------------
  function IconButton(props) {
    var variant = props.variant || "outlined";
    var ripple = useRipple();
    var morph = useShapeMorph(9999, 16);
    return h("button", {
      type: "button",
      className: ["msds-icon-btn", "msds-icon-btn-" + variant, "msds-ripple-host", props.className].filter(Boolean).join(" "),
      style: morph.style,
      "aria-pressed": props.pressed !== undefined ? !!props.pressed : undefined,
      "aria-label": props.label,
      title: props.label,
      onPointerDown: function (e) { ripple.onPointerDown(e); morph.bind.onPointerDown(e); },
      onPointerUp: morph.bind.onPointerUp,
      onPointerLeave: morph.bind.onPointerLeave,
      onPointerCancel: morph.bind.onPointerCancel,
      onClick: props.onToggle
    }, ripple.layer, msdsIcon(props.pressed ? (props.iconOn || "star") : (props.iconOff || "starOutline")));
  }

  // ---------------------------------------------------------------------
  // ButtonGroup — segmented / mutually exclusive control.
  // ---------------------------------------------------------------------
  function ButtonGroup(props) {
    var options = props.options || [];
    return h("div", { className: "msds-segmented", role: "group", "aria-label": props.label },
      options.map(function (opt) {
        var active = opt.value === props.value;
        return h("button", {
          key: opt.value, type: "button", className: "msds-segmented-item",
          "data-active": active ? "true" : "false",
          "aria-pressed": active,
          onClick: function () { props.onChange && props.onChange(opt.value); }
        }, opt.label);
      })
    );
  }

export { Button, ButtonGroup, IconButton };
