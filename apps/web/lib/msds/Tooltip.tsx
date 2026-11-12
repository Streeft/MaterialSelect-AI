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
 * MSDS — Tooltip. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // Tooltip — rótulo curto por hover/foco (diferente do Popover, que é
  // por clique e leva conteúdo rico). Rodada 7, item 3: variant "rich"
  // (título + corpo + ação opcional) ao lado do "plain" (comportamento
  // original, inalterado — a árvore abaixo para variant="plain" é
  // byte-idêntica à de antes da Rodada 7). Diferença de semântica de
  // acessibilidade, não só visual: "plain" é role="tooltip", nunca leva
  // foco nem conteúdo interativo — um leitor de tela só o anuncia como
  // descrição do elemento focado. "rich" é role="dialog": pode conter um
  // botão de ação de verdade, então precisa ser alcançável por teclado
  // (fica aberto quando o ponteiro entra nele, ao contrário do "plain",
  // que fecha assim que sai do host — sem essa folga um rich tooltip com
  // botão seria impossível de clicar com o mouse).
  // ---------------------------------------------------------------------
  function Tooltip(props) {
    var variant = props.variant || "plain";
    var s = useState(false); var open = s[0], setOpen = s[1];
    // Hooks sempre incondicionais (Rules of Hooks) — mesmo que só a variante
    // "rich" use o temporizador, o hook em si roda em toda renderização.
    var closeTimer = React.useRef(null);
    function clearCloseTimer() { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } }
    useEffect(function () { return clearCloseTimer; }, []);
    if (variant === "rich") {
      function show() { clearCloseTimer(); setOpen(true); }
      function scheduleHide() { clearCloseTimer(); closeTimer.current = setTimeout(function () { setOpen(false); }, 100); }
      return h("span", {
        className: "msds-tooltip-wrap",
        onMouseEnter: show, onMouseLeave: scheduleHide,
        onFocus: show,
        onBlur: function (e) {
          var wrap = e.currentTarget;
          // Fecha só se o foco saiu do host E do próprio balão (um botão
          // dentro do balão pode receber o foco sem que o tooltip deva sumir).
          requestAnimationFrame(function () { if (!wrap.contains(document.activeElement)) setOpen(false); });
        }
      },
        props.children,
        open ? h("div", {
          className: "msds-tooltip-rich", role: "dialog", "aria-label": typeof props.title === "string" ? props.title : undefined,
          onMouseEnter: show, onMouseLeave: scheduleHide
        },
          props.title ? h("div", { className: "msds-tooltip-rich-title" }, props.title) : null,
          props.body ? h("div", { className: "msds-tooltip-rich-body" }, props.body) : null,
          props.action ? h("button", {
            type: "button", className: "msds-tooltip-rich-action", onClick: props.action.onClick
          }, props.action.label) : null
        ) : null
      );
    }
    return h("span", {
      className: "msds-tooltip-wrap",
      onMouseEnter: function () { setOpen(true); }, onMouseLeave: function () { setOpen(false); },
      onFocus: function () { setOpen(true); }, onBlur: function () { setOpen(false); }
    },
      props.children,
      open ? h("span", { className: "msds-tooltip-bubble", role: "tooltip" }, props.label) : null
    );
  }

export { Tooltip };
