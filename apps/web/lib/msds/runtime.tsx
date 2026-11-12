// @ts-nocheck
/* eslint-disable react-hooks/refs, react-hooks/immutability -- D-76: the
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
 * MSDS — runtime. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";


  var UID_SEQ = { n: 0 };

  function useUid(prefix) {
    var ref = React.useRef(null);
    if (ref.current === null) { UID_SEQ.n += 1; ref.current = (prefix || "msds") + "-" + UID_SEQ.n; }
    return ref.current;
  }

  // D-196: the reader's "Reduzido" on Aparência counts as much as the system's.
  function prefersReducedMotion() {
    if (typeof window === "undefined") return false;
    if (document.documentElement.dataset.motion === "reduced") return true;
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

export { UID_SEQ, prefersReducedMotion, useUid };
