// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — windowClass. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // useWindowClass — as três classes de largura da M3 (compact <600,
  // medium 600–839, expanded ≥840), para uma composição alternar
  // NavRail/TopAppBar+NavDrawer de verdade, não só documentar o número.
  // ---------------------------------------------------------------------
  function classifyWidth(w) { return w < 600 ? "compact" : w < 840 ? "medium" : "expanded"; }

  function useWindowClass() {
    var s = useState(function () { return typeof window !== "undefined" ? classifyWidth(window.innerWidth) : "expanded"; });
    var cls = s[0], setCls = s[1];
    useEffect(function () {
      function onResize() { setCls(classifyWidth(window.innerWidth)); }
      window.addEventListener("resize", onResize);
      onResize();
      return function () { window.removeEventListener("resize", onResize); };
    }, []);
    return cls;
  }

export { classifyWidth, useWindowClass };
