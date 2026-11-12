// @ts-nocheck
/* eslint-disable react-hooks/refs -- D-76: the
   duplicate-declaration fix below let ESLint's React Compiler rules fully
   analyze this vendored, straight-ported bundle for the first time (they
   previously aborted silently on the parse-level duplicate identifier, the
   same reason `tsc` stayed quiet — see the note above the barrel re-export
   at the bottom of this file). The 34 errors that surfaced are all inside
   demo-only components (`ContainerTransformDemo`, `ScreenTransitionDemo`,
   the Dialog/BottomSheet/Popover/Menu/SideSheet/DatePicker family's own
   internal ref usage) that read a ref's `.current` during render — patterns
   the source Artifact bundle already used before this port and that this
   task's scope is a mechanical module-wiring port of, not a behavioral
   rewrite (D-74). Disabled here, at the same file granularity `@ts-nocheck`
   already uses, rather than rewritten line by line. */
"use client";
/**
 * MSDS — SideSheet. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { IconButton } from "./Button";
import { useFocusTrap } from "./Dialog";

const h = React.createElement;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // SideSheet — Rodada 6, item 6: painel que desliza da lateral (side prop,
  // default "right"). Dois modos: "modal" (backdrop, useFocusTrap
  // compartilhado com Dialog/BottomSheet/NavDrawer, Escape fecha) e
  // "standalone" (sem backdrop, ocupa espaço ao lado do conteúdo — quem
  // chama é quem faz o layout de duas colunas; este componente só renderiza
  // o painel em si, position:relative dentro do próprio fluxo).
  // ---------------------------------------------------------------------
  function SideSheet(props) {
    var side = props.side || "right";
    var mode = props.mode || "modal";
    var ref = React.useRef(null);
    var isModal = mode === "modal";
    useFocusTrap(isModal && props.open, ref);
    useEffect(function () {
      if (!isModal || !props.open) return;
      function onKey(e) { if (e.key === "Escape") props.onClose && props.onClose(); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [isModal, props.open]);
    if (!props.open) return null;
    var panel = h("div", {
      className: "msds-sidesheet msds-sidesheet-" + side + " msds-sidesheet-" + mode,
      role: isModal ? "dialog" : undefined, "aria-modal": isModal ? "true" : undefined,
      "aria-labelledby": props.title ? "msds-sidesheet-title" : undefined,
      style: props.width ? { width: props.width } : undefined,
      ref: isModal ? ref : null
    },
      h("div", { className: "msds-dialog-header" },
        props.title ? h("h3", { id: "msds-sidesheet-title", className: "msds-card-title" }, props.title) : h("span", null),
        h(IconButton, { label: "Fechar", onToggle: props.onClose, iconOn: "close", iconOff: "close", variant: "standard" })
      ),
      h("div", { className: "msds-sidesheet-body" }, props.children)
    );
    if (!isModal) return panel;
    return h("div", { className: "msds-sidesheet-backdrop", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose && props.onClose(); } }, panel);
  }

export { SideSheet };
