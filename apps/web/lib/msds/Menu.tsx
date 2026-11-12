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
 * MSDS — Menu. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // Menu — lista de ações ancorada (mesma base de posicionamento do
  // Popover; papel menu/menuitem). Rodada 7, item 4: um item pode carregar
  // "items" aninhado — a lista em si (MenuItemsList/MenuItemRow, abaixo) é
  // recursiva: um MenuItemRow com submenu renderiza outro MenuItemsList
  // dentro de si, a mesma função que o próprio Menu usa para sua primeira
  // camada. Para um item sem submenu, a saída é byte-idêntica à de antes
  // da Rodada 7 (mesmas classes, mesma ordem de filhos) — só o item com
  // "items" ganha comportamento novo.
  // ---------------------------------------------------------------------
  function MenuItemRow(props) {
    var it = props.item;
    var hasSubmenu = !!(it.items && it.items.length);
    var ss = useState(false); var subOpen = ss[0], setSubOpen = ss[1];
    var itemRef = React.useRef(null);
    var subRef = React.useRef(null);
    var fs = useState("right"); var side = fs[0], setSide = fs[1];
    // Quando ArrowLeft devolve o foco a ESTE botão e ele próprio tem
    // submenu, o onFocus abaixo reabriria o que acabou de fechar (o mesmo
    // gatilho que abre por hover/Tab). Uma flag síncrona (não estado —
    // não pode esperar um re-render) pula esse único onFocus programático.
    var skipNextFocusOpen = React.useRef(false);
    useEffect(function () {
      if (!subOpen) return;
      var rect = itemRef.current ? itemRef.current.getBoundingClientRect() : null;
      var w = (subRef.current && subRef.current.offsetWidth) || 200;
      var fitsRight = !rect || (rect.right + w <= window.innerWidth);
      setSide(fitsRight ? "right" : "left");
    }, [subOpen]);
    function openSub() { if (hasSubmenu && !it.disabled) setSubOpen(true); }
    function closeSub() { setSubOpen(false); }
    function focusSelfWithoutReopening() {
      skipNextFocusOpen.current = true;
      if (itemRef.current) itemRef.current.focus();
    }
    function onKeyDown(e) {
      if (hasSubmenu && (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openSub();
        requestAnimationFrame(function () {
          var first = subRef.current && subRef.current.querySelector('[role="menuitem"]');
          if (first) first.focus();
        });
      }
    }
    return h("li", { role: "none", style: { position: "relative" } },
      h("button", {
        ref: itemRef, role: "menuitem", type: "button", className: "msds-menu-item", disabled: it.disabled,
        "aria-haspopup": hasSubmenu ? "menu" : undefined, "aria-expanded": hasSubmenu ? subOpen : undefined,
        onMouseEnter: hasSubmenu ? openSub : undefined,
        onMouseLeave: hasSubmenu ? closeSub : undefined,
        onFocus: hasSubmenu ? function () {
          if (skipNextFocusOpen.current) { skipNextFocusOpen.current = false; return; }
          openSub();
        } : undefined,
        onKeyDown: onKeyDown,
        onClick: function () {
          if (it.disabled) return;
          if (hasSubmenu) { setSubOpen(function (o) { return !o; }); return; }
          it.onSelect && it.onSelect();
          props.onClose && props.onClose();
        }
      },
        it.icon ? h("span", { className: "msds-menu-icon" }, msdsIcon(it.icon)) : null,
        it.label,
        hasSubmenu ? h("span", { className: "msds-menu-item-caret", "aria-hidden": "true" }, msdsIcon(side === "right" ? "chevronRight" : "chevronLeft")) : null
      ),
      hasSubmenu && subOpen ? h("div", {
        ref: subRef, className: "msds-menu-submenu msds-menu-submenu-" + side,
        onMouseEnter: openSub, onMouseLeave: closeSub,
        // ArrowLeft: fecha só este submenu e devolve o foco ao próprio item —
        // preso aqui (não no botão do item) porque o botão não é ancestral
        // DOM do submenu (são irmãos dentro do mesmo <li>); um submenu mais
        // fundo trata o ArrowLeft primeiro e para a propagação, então cada
        // nível fecha um de cada vez, nunca a cadeia inteira de uma vez.
        onKeyDown: function (e) {
          if (e.key === "ArrowLeft") {
            e.preventDefault(); e.stopPropagation();
            closeSub();
            focusSelfWithoutReopening();
          }
        }
      },
        h(MenuItemsList, { items: it.items, tonalElevation: props.tonalElevation, onClose: props.onClose })
      ) : null
    );
  }

  function MenuItemsList(props) {
    return h("ul", { className: "msds-menu", role: "menu", "data-tonal-elevation": props.tonalElevation ? "true" : "false" },
      (props.items || []).map(function (it, i) {
        return h(MenuItemRow, { key: i, item: it, tonalElevation: props.tonalElevation, onClose: props.onClose });
      })
    );
  }

  function Menu(props) {
    var s = useState(false); var open = s[0], setOpen = s[1];
    var ref = React.useRef(null);
    useEffect(function () {
      if (!open) return;
      function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
      // Escape sempre fecha a partir do topo — fecha este Menu inteiro
      // (desmonta a árvore, o que já fecha qualquer submenu aberto dentro
      // dele, não importa a profundidade), a cadeia inteira nunca meio-aberta.
      function onKey(e) { if (e.key === "Escape") setOpen(false); }
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
    }, [open]);
    return h("div", { className: "msds-menu-wrap", ref: ref },
      h("button", { type: "button", className: "msds-menu-trigger", "aria-haspopup": "menu", "aria-expanded": open, onClick: function () { setOpen(!open); } }, props.trigger),
      open ? h(MenuItemsList, { items: props.items, tonalElevation: props.tonalElevation, onClose: function () { setOpen(false); } }) : null
    );
  }

export { Menu, MenuItemRow, MenuItemsList };
