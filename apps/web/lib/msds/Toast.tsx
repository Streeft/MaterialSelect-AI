// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Toast. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { prefersReducedMotion } from "./runtime";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // Toast — pilha de notificação com tom semântico.
  // ---------------------------------------------------------------------
  function Toast(props) {
    var ls = useState(false); var leaving = ls[0], setLeaving = ls[1];
    function dismiss() {
      if (prefersReducedMotion()) { props.onDismiss && props.onDismiss(); return; }
      setLeaving(true);
      setTimeout(function () { props.onDismiss && props.onDismiss(); }, 160);
    }
    return h("div", { className: "msds-toast msds-toast-" + (props.tone || "neutral") + (leaving ? " is-leaving" : ""), role: "status" },
      h("span", { className: "msds-toast-message" }, props.message),
      props.action ? h("button", { className: "msds-toast-action", onClick: function () { props.action.onClick && props.action.onClick(); dismiss(); } }, props.action.label) : null,
      h("button", { className: "msds-toast-close", "aria-label": "Dispensar", onClick: dismiss }, msdsIcon("close"))
    );
  }

  function ToastStack(props) {
    return h("div", { className: "msds-toast-stack", "aria-live": "polite" },
      (props.items || []).map(function (t) { return h(Toast, { key: t.id, tone: t.tone, message: t.message, action: t.action, onDismiss: function () { props.onDismiss && props.onDismiss(t.id); } }); })
    );
  }

export { Toast, ToastStack };
