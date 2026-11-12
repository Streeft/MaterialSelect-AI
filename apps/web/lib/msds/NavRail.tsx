// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — NavRail. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { useRipple } from "./motion";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // NavRail — rail recolhível, item ativo sinalizado em 3 canais.
  // ---------------------------------------------------------------------
  function NavRailItemButton(props) {
    var item = props.item, active = props.active;
    var ripple = useRipple();
    return h("button", {
      key: item.key, type: "button", className: "msds-rail-item msds-ripple-host",
      "aria-current": active ? "page" : undefined,
      style: active ? { "--row-accent": item.accent } : undefined,
      onPointerDown: ripple.onPointerDown,
      onClick: function () { props.onSelect && props.onSelect(item.key); }
    },
      ripple.layer,
      h("span", { className: "msds-rail-icon" }, msdsIcon(item.icon)),
      h("span", { className: "msds-rail-label" }, item.label)
    );
  }

  function NavRail(props) {
    var items = props.items || [];
    var collapsed = !!props.collapsed;
    // Agrupa preservando a ordem — item sem "group" fica solto (ex.: Início);
    // a partir daí, cada troca de "group" abre um bloco novo com eyebrow.
    // O componente não hardcoda nenhum nome de grupo: quem chama decide
    // quantos grupos existem e o que cada um se chama — é assim que um
    // botão novo "que surgir no futuro" só precisa entrar em items, nunca
    // exigir mudança aqui.
    var blocks = [];
    items.forEach(function (item) {
      var last = blocks[blocks.length - 1];
      if (last && last.group === (item.group || null)) { last.items.push(item); }
      else { blocks.push({ group: item.group || null, items: [item] }); }
    });
    return h("nav", { className: "msds-rail", "data-collapsed": collapsed ? "true" : "false", "aria-label": props.label || "Navegação principal" },
      blocks.map(function (block, bi) {
        return h("div", { className: "msds-rail-group", key: bi },
          block.group ? h("div", { className: "msds-rail-eyebrow" }, block.group) : null,
          block.items.map(function (item) {
            var active = item.key === props.activeKey;
            return h(NavRailItemButton, { key: item.key, item: item, active: active, onSelect: props.onSelect });
          })
        );
      }),
      h("button", {
        type: "button", className: "msds-rail-toggle", onClick: props.onToggleCollapse,
        "aria-label": collapsed ? "Expandir navegação" : "Recolher navegação"
      }, msdsIcon("chevrons"))
    );
  }

export { NavRail, NavRailItemButton };
