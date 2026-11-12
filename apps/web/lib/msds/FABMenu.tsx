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
 * MSDS — FABMenu. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { FAB_PRESSED_RADIUS, FAB_REST_RADIUS } from "./FAB";
import { SPRING, useRipple, useShapeMorph, useSpring } from "./motion";
import { prefersReducedMotion } from "./runtime";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // FABMenu — Rodada 7, item 1: o FAB expande uma pequena lista vertical de
  // ações (ícone+rótulo) acima de si, em vez de abrir um Menu ancorado
  // genérico. A forma do próprio FAB reaproveita useShapeMorph/spatialFast
  // (Rodada 6) — o alvo é o estado "aberto", não a pressão do ponteiro (como
  // o Chip, que morfa por seleção e não por toque). Não é modal: Escape e
  // clique fora fecham (mesmo padrão de Menu/Popover), o conteúdo por trás
  // continua operável — por isso useFocusTrap não entra aqui. Cada item
  // entra com um leve atraso incremental antes de sua própria mola assentar
  // (useSpring/spatialDefault) — o "stagger" é só esse atraso de partida, a
  // curva em si é a mesma mola de sempre, nunca uma equação nova.
  // ---------------------------------------------------------------------
  function FABMenuItemRow(props) {
    var item = props.item, index = props.index, open = props.open;
    var ds = useState(false); var started = ds[0], setStarted = ds[1];
    useEffect(function () {
      if (open) {
        if (prefersReducedMotion()) { setStarted(true); return; }
        var t = setTimeout(function () { setStarted(true); }, index * 45);
        return function () { clearTimeout(t); };
      }
      setStarted(false);
    }, [open, index]);
    var presence = useSpring(started ? 1 : 0, SPRING.spatialDefault, 0);
    var ripple = useRipple();
    return h("li", { role: "none" },
      h("button", {
        role: "menuitem", type: "button", className: "msds-fabmenu-item msds-ripple-host", disabled: item.disabled,
        style: { opacity: Math.max(0, presence), transform: "translateY(" + ((1 - presence) * 10) + "px) scale(" + (0.86 + presence * 0.14) + ")" },
        onPointerDown: ripple.onPointerDown,
        onClick: function () { if (item.disabled) return; item.onSelect && item.onSelect(); props.onSelected && props.onSelected(); }
      },
        ripple.layer,
        h("span", { className: "msds-fabmenu-item-label" }, item.label),
        h("span", { className: "msds-fabmenu-item-icon" }, msdsIcon(item.icon))
      )
    );
  }

  function FABMenu(props) {
    var size = props.size || "default";
    var ripple = useRipple();
    var s = useState(false); var open = s[0], setOpen = s[1];
    var wrapRef = React.useRef(null);
    var morph = useShapeMorph(FAB_REST_RADIUS[size], FAB_PRESSED_RADIUS[size], open);
    useEffect(function () {
      if (!open) return;
      function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
      function onKey(e) { if (e.key === "Escape") setOpen(false); }
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
    }, [open]);
    var items = props.items || [];
    var fabHeight = size === "small" ? 40 : size === "large" ? 96 : 56;
    var listBottom = 24 + fabHeight + 12;
    return h("div", { className: "msds-fabmenu-wrap", ref: wrapRef },
      open ? h("ul", {
        className: "msds-fabmenu-list", role: "menu", "aria-label": props.menuLabel || "Ações",
        style: { bottom: listBottom + "px" }
      },
        items.map(function (it, i) {
          return h(FABMenuItemRow, { key: i, item: it, index: i, open: open, onSelected: function () { setOpen(false); } });
        })
      ) : null,
      h("button", {
        type: "button", className: "msds-fab msds-ripple-host msds-fab-" + size,
        style: props.style ? Object.assign({}, props.style, morph.style) : morph.style,
        "data-icon-only": (props.label && !open) ? "false" : "true",
        "data-raised-above-tray": props.raisedAboveTray ? "true" : "false",
        "aria-haspopup": "menu", "aria-expanded": open,
        "aria-label": props.a11yLabel || props.label,
        onPointerDown: ripple.onPointerDown,
        onClick: function () { setOpen(!open); }
      }, ripple.layer, msdsIcon(open ? "close" : (props.icon || "star")), (props.label && !open) ? h("span", null, props.label) : null)
    );
  }

export { FABMenu, FABMenuItemRow };
