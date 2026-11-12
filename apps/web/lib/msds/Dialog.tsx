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
 * MSDS — Dialog. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { IconButton } from "./Button";

const h = React.createElement;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // Dialog — modal com foco preso, Escape fecha, foco volta ao gatilho.
  // ---------------------------------------------------------------------
  function useFocusTrap(open, ref) {
    useEffect(function () {
      if (!open || !ref.current) return;
      var root = ref.current;
      var previouslyFocused = document.activeElement;
      var selector = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
      function focusables() { return Array.prototype.slice.call(root.querySelectorAll(selector)); }
      var list = focusables();
      if (list.length) list[0].focus();
      function onKeydown(e) {
        if (e.key === "Tab") {
          var items = focusables();
          if (!items.length) return;
          var first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      root.addEventListener("keydown", onKeydown);
      return function () {
        root.removeEventListener("keydown", onKeydown);
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      };
    }, [open]);
  }

  // Rodada 8, item 4: Dialog ganha dois props aditivos, opcionais, sem
  // efeito nenhum quando ausentes — surfaceRef (para useContainerTransform
  // medir a superfície) e transformStyle (o style vindo daquele hook, que
  // sobrescreve posição/tamanho/raio enquanto a mola física está ativa).
  function mergeRefs(a, b) {
    return function (node) {
      if (typeof a === "function") a(node); else if (a) a.current = node;
      if (typeof b === "function") b(node); else if (b) b.current = node;
    };
  }

  function Dialog(props) {
    var ref = React.useRef(null);
    useFocusTrap(props.open, ref);
    useEffect(function () {
      if (!props.open) return;
      function onKey(e) { if (e.key === "Escape") props.onClose && props.onClose(); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [props.open]);
    if (!props.open) return null;
    var surfaceRef = props.surfaceRef ? mergeRefs(ref, props.surfaceRef) : ref;
    return h("div", { className: "msds-dialog-backdrop", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose && props.onClose(); } },
      h("div", {
        className: "msds-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "msds-dialog-title", ref: surfaceRef,
        "data-tonal-elevation": props.tonalElevation ? "true" : "false",
        "data-container-transform": props.transformStyle ? "true" : "false",
        style: props.transformStyle || undefined
      },
        h("div", { className: "msds-dialog-header" },
          h("h3", { id: "msds-dialog-title", className: "msds-card-title" }, props.title),
          h(IconButton, { label: "Fechar", onToggle: props.onClose, iconOff: "close", iconOn: "close" })
        ),
        h("div", { className: "msds-dialog-body" }, props.children),
        props.footer ? h("div", { className: "msds-dialog-footer" }, props.footer) : null
      )
    );
  }

export { Dialog, mergeRefs, useFocusTrap };
