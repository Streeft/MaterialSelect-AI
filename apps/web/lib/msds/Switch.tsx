// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Switch. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { useUid } from "./runtime";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Switch — alternador binário IMEDIATO (liga a opção na hora, ao
  // contrário do Checkbox, que normalmente acompanha um "Salvar").
  // ---------------------------------------------------------------------
  function Switch(props) {
    var uid = useUid("switch");
    return h("label", { className: "msds-switch", htmlFor: uid },
      h("input", { id: uid, type: "checkbox", role: "switch", checked: !!props.checked, disabled: props.disabled, onChange: function (e) { props.onChange && props.onChange(e.target.checked); } }),
      h("span", { className: "msds-switch-track", "aria-hidden": "true" }, h("span", { className: "msds-switch-thumb" })),
      props.label ? h("span", { className: "msds-switch-label" }, props.label) : null
    );
  }

export { Switch };
