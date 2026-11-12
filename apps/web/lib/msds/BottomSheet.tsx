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
 * MSDS — BottomSheet. Split out of `./msds.tsx` (D-209) without changing a line
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
  // BottomSheet — modal que desliza do rodapé; mesmo foco preso/backdrop/
  // Escape do Dialog (useFocusTrap compartilhado), só a geometria muda.
  // ---------------------------------------------------------------------
  function BottomSheet(props) {
    var ref = React.useRef(null);
    useFocusTrap(props.open, ref);
    useEffect(function () {
      if (!props.open) return;
      function onKey(e) { if (e.key === "Escape") props.onClose && props.onClose(); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [props.open]);
    if (!props.open) return null;
    return h("div", { className: "msds-sheet-backdrop", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose && props.onClose(); } },
      h("div", { className: "msds-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": props.title ? "msds-sheet-title" : undefined, ref: ref, "data-tonal-elevation": props.tonalElevation ? "true" : "false" },
        h("div", { className: "msds-sheet-handle", "aria-hidden": "true" }),
        props.title ? h("div", { className: "msds-dialog-header" },
          h("h3", { id: "msds-sheet-title", className: "msds-card-title" }, props.title),
          h(IconButton, { label: "Fechar", onToggle: props.onClose, iconOn: "close", iconOff: "close", variant: "standard" })
        ) : null,
        h("div", { className: "msds-sheet-body" }, props.children)
      )
    );
  }

export { BottomSheet };
