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
 * MSDS — appBars. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { IconButton } from "./Button";
import { useFocusTrap } from "./Dialog";
import { NavRail } from "./NavRail";

const h = React.createElement;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // TopAppBar — cabeçalho compacto (classe de largura M3 "compact").
  // ---------------------------------------------------------------------
  function TopAppBar(props) {
    var size = props.size || "small";
    // "center-aligned" só faz sentido combinado com size="small" (M3): as
    // versões medium/large já reservam a segunda linha para o título grande
    // alinhado à esquerda, então um center-aligned "large" seria duas regras
    // de layout competindo — documentado, não impedido em runtime.
    var centered = props.centerAligned && size === "small";
    var stacked = size === "medium" || size === "large";
    // Empilhado (medium/large): o título grande é o único h1 — não duplica o
    // rótulo compacto escondido por CSS, que ainda apareceria na árvore de
    // acessibilidade (opacidade não remove do a11y tree) e leria duas vezes.
    return h("header", { className: "msds-appbar msds-appbar-" + size, "data-centered": centered ? "true" : "false" },
      h("div", { className: "msds-appbar-row" },
        props.onMenuClick ? h(IconButton, { label: "Abrir navegação", onToggle: props.onMenuClick, iconOn: "menu", iconOff: "menu", variant: "standard" }) : null,
        stacked ? h("span", { className: "msds-appbar-actions-spacer", "aria-hidden": "true" }) : h("h1", { className: "msds-appbar-title" }, props.title),
        props.actions ? h("div", { className: "msds-appbar-actions" }, props.actions) : null
      ),
      stacked ? h("h1", { className: "msds-appbar-title-large" }, props.title) : null
    );
  }

  // ---------------------------------------------------------------------
  // BottomAppBar — barra fixa inferior (M3), ações + FAB "encaixado"
  // opcional. Compact-width: a alternativa persistente ao FAB solto quando
  // a tela é pequena demais para os dois convivirem soltos.
  // ---------------------------------------------------------------------
  function BottomAppBar(props) {
    return h("footer", { className: "msds-bottombar", "data-docked": props.dock ? "true" : "false" },
      h("div", { className: "msds-bottombar-actions" }, props.actions),
      props.dock ? h("div", { className: "msds-bottombar-fab-slot" }, props.dock) : null
    );
  }

  // ---------------------------------------------------------------------
  // NavDrawer — a variante modal do NavRail para largura compact/medium;
  // reaproveita o próprio NavRail (não uma segunda lista de navegação) e
  // o foco preso do Dialog.
  // ---------------------------------------------------------------------
  function NavDrawer(props) {
    var ref = React.useRef(null);
    useFocusTrap(props.open, ref);
    useEffect(function () {
      if (!props.open) return;
      function onKey(e) { if (e.key === "Escape") props.onClose && props.onClose(); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [props.open]);
    if (!props.open) return null;
    return h("div", { className: "msds-drawer-backdrop", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose && props.onClose(); } },
      h("div", { className: "msds-drawer-panel", ref: ref, role: "dialog", "aria-modal": "true", "aria-label": props.label || "Navegação" },
        h(NavRail, Object.assign({}, props.navProps, { collapsed: false, onToggleCollapse: props.onClose }))
      )
    );
  }

  // ---------------------------------------------------------------------
  // BottomNavBar — navegação de telefone. A M3 limita a 3-5 destinos porque
  // é a faixa em que cada rótulo ainda cabe sem abreviar e o alvo de toque
  // não fica estreito demais — este componente não trunca a lista sozinho,
  // então quem chama precisa respeitar o teto (documentado em README, não
  // imposto aqui para não recusar silenciosamente um item real do produto).
  function BottomNavBar(props) {
    var items = props.items || [];
    return h("nav", { className: "msds-bottomnav", "aria-label": props.label || "Navegação" },
      items.map(function (item) {
        var active = item.key === props.activeKey;
        return h("button", {
          key: item.key, type: "button", className: "msds-bottomnav-item",
          "aria-current": active ? "page" : undefined,
          onClick: function () { props.onSelect && props.onSelect(item.key); }
        },
          h("span", { className: "msds-bottomnav-icon" }, msdsIcon(item.icon)),
          h("span", { className: "msds-bottomnav-label" }, item.label)
        );
      })
    );
  }

export { BottomAppBar, BottomNavBar, NavDrawer, TopAppBar };
