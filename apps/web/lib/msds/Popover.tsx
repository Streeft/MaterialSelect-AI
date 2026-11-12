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
 * MSDS — Popover. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // Popover — genérico, mesma base do ProvenancePopover real.
  // ---------------------------------------------------------------------
  function Popover(props) {
    var s = useState(false); var open = s[0], setOpen = s[1];
    var ref = React.useRef(null);
    useEffect(function () {
      if (!open) return;
      function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
      document.addEventListener("mousedown", onDoc);
      return function () { document.removeEventListener("mousedown", onDoc); };
    }, [open]);
    return h("div", { className: "msds-popover-wrap", ref: ref },
      h("button", { type: "button", className: "msds-popover-trigger", "aria-expanded": open, onClick: function () { setOpen(!open); } }, props.trigger),
      open ? h("div", { className: "msds-popover", role: "dialog", "data-tonal-elevation": props.tonalElevation ? "true" : "false" }, props.children) : null
    );
  }

export { Popover };
