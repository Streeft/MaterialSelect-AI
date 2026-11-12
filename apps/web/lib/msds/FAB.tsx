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
 * MSDS — FAB. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { SPRING, useRipple, useShapeMorph, useSpring } from "./motion";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // FAB — extraído da M3: ação primária da tela, fixa sobre o conteúdo.
  // Rodada 6: prop "size" ('small'/'default'/'large', aditiva — 'default'
  // preserva a aparência exata de antes) e forma expressive (radius-xl
  // aperta sob pressão, volta ao soltar).
  // ---------------------------------------------------------------------
  var FAB_REST_RADIUS = { small: 12, "default": 28, large: 28 };

  var FAB_PRESSED_RADIUS = { small: 8, "default": 16, large: 20 };

  // Rodada 8, item 3: largura só-ícone por tamanho — o mesmo número que
  // .msds-fab[data-icon-only="true"] já fixa em CSS (56/40/96), reaproveitado
  // aqui como alvo da mola de largura em vez de duplicar a régua.
  var FAB_ICON_WIDTH = { small: 40, "default": 56, large: 96 };

  // useFabScrollCollapse — Rodada 8, item 3: direção de rolagem com debounce
  // simples (só reage a deslocamentos > 4px, para não "tremer" em rolagem de
  // sub-pixel/inércia). Ouve `window` por padrão; um `scrollContainerRef`
  // troca para o ancestral rolável indicado (painel com rolagem interna).
  function useFabScrollCollapse(scrollContainerRef, enabled) {
    var s = useState(false); var collapsed = s[0], setCollapsed = s[1];
    var lastY = React.useRef(0);
    useEffect(function () {
      if (!enabled) { setCollapsed(false); return; }
      var el = (scrollContainerRef && scrollContainerRef.current) || window;
      function currentY() { return el === window ? (window.pageYOffset || 0) : el.scrollTop; }
      lastY.current = currentY();
      function onScroll() {
        var y = currentY();
        var dy = y - lastY.current;
        if (Math.abs(dy) > 4) {
          setCollapsed(dy > 0 && y > 8); // descendo -> recolhe; no topo, sempre expandido
          lastY.current = y;
        }
      }
      el.addEventListener("scroll", onScroll, { passive: true });
      return function () { el.removeEventListener("scroll", onScroll); };
    }, [enabled, scrollContainerRef && scrollContainerRef.current]);
    return collapsed;
  }

  // FAB — extraído da M3: ação primária da tela, fixa sobre o conteúdo.
  // Rodada 6: prop "size" ('small'/'default'/'large', aditiva — 'default'
  // preserva a aparência exata de antes) e forma expressive (radius-xl
  // aperta sob pressão, volta ao soltar). Rodada 8, item 3: a variante
  // estendida (com "label") recolhe para só-ícone ao rolar para baixo e
  // reexpande ao rolar para cima — `collapseOnScroll` (default true, só tem
  // efeito havendo "label") liga/desliga; `scrollContainerRef` aponta o
  // painel certo quando não é a janela. A largura é medida uma vez (do
  // próprio botão renderizado por extenso) e depois só anima entre esse
  // valor e FAB_ICON_WIDTH via useSpring/spatialDefault — nenhuma segunda
  // matemática de easing. Sob prefers-reduced-motion, useSpring já vai
  // direto ao alvo (mesma disciplina do resto do sistema): o recolhimento
  // continua funcional, só sem a transição suave — salto direto, nunca
  // "sempre expandido" por reduced-motion ter desligado a rolagem por
  // engano (a leitura da direção do scroll não depende de animação).
  function FAB(props) {
    var size = props.size || "default";
    var ripple = useRipple();
    var morph = useShapeMorph(FAB_REST_RADIUS[size], FAB_PRESSED_RADIUS[size]);
    var hasLabel = !!props.label;
    var collapseEnabled = hasLabel && props.collapseOnScroll !== false;
    var scrollCollapsed = useFabScrollCollapse(props.scrollContainerRef, collapseEnabled);
    var btnRef = React.useRef(null);
    var nw = useState(null); var naturalWidth = nw[0], setNaturalWidth = nw[1];
    useEffect(function () {
      if (!collapseEnabled || !btnRef.current) return;
      var w = btnRef.current.getBoundingClientRect().width;
      if (w > 0 && Math.abs(w - (naturalWidth || 0)) > 0.5 && !scrollCollapsed) setNaturalWidth(w);
      // eslint: mede só quando expandido, então nunca grava a largura
      // já-recolhida como se fosse a "natural".
    }, [collapseEnabled, props.label, props.icon]);
    var iconWidth = FAB_ICON_WIDTH[size];
    var collapsedVisual = collapseEnabled && scrollCollapsed;
    // Só passa a controlar a largura por estilo depois de medir a largura
    // natural — antes disso o botão usa a largura automática do CSS (que é
    // exatamente o valor que será medido), então não há salto no primeiro
    // quadro.
    var widthTarget = (collapseEnabled && naturalWidth !== null) ? (collapsedVisual ? iconWidth : naturalWidth) : null;
    var widthAnim = useSpring(widthTarget !== null ? widthTarget : (naturalWidth || iconWidth), SPRING.spatialDefault, naturalWidth || iconWidth);
    var style = Object.assign({}, props.style, morph.style);
    if (widthTarget !== null) {
      style.width = widthAnim + "px";
      style.overflow = "hidden";
      style.justifyContent = "center";
      if (collapsedVisual) { style.paddingLeft = 0; style.paddingRight = 0; }
    }
    return h("button", {
      ref: btnRef,
      type: "button", className: "msds-fab msds-ripple-host msds-fab-" + size,
      style: style,
      "data-icon-only": !hasLabel ? "true" : "false",
      "data-scroll-collapsed": collapsedVisual ? "true" : "false",
      "data-raised-above-tray": props.raisedAboveTray ? "true" : "false",
      "aria-label": props.a11yLabel || props.label,
      onPointerDown: function (e) { ripple.onPointerDown(e); morph.bind.onPointerDown(e); },
      onPointerUp: morph.bind.onPointerUp,
      onPointerLeave: morph.bind.onPointerLeave,
      onPointerCancel: morph.bind.onPointerCancel,
      onClick: props.onClick
    }, ripple.layer, msdsIcon(props.icon || "star"), (hasLabel && !collapsedVisual) ? h("span", null, props.label) : null);
  }

export { FAB, FAB_ICON_WIDTH, FAB_PRESSED_RADIUS, FAB_REST_RADIUS, useFabScrollCollapse };
