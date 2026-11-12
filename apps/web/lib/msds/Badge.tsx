// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — Badge. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";

const h = React.createElement;

  // ---------------------------------------------------------------------
  // Badge / DataQualityBadge — o "quarto estado" nunca vira zero silencioso.
  // ---------------------------------------------------------------------
  function Badge(props) {
    return h("span", { className: "msds-badge msds-badge-" + (props.tone || "neutral") }, props.children);
  }

  // NotificationBadge — ponto/contador de sobreposição (posicionado de fora,
  // pelo host, com position:relative + este componente absolute num canto).
  // Não confundir com Badge: Badge é um rótulo de texto inline; este é um
  // marcador mínimo sobre um ícone/avatar (mensagens não lidas, alertas).
  function NotificationBadge(props) {
    var count = props.count;
    var dot = count === undefined || props.dot;
    var display = dot ? null : (props.max && count > props.max ? props.max + "+" : String(count));
    if (!dot && (count === undefined || count === 0) && !props.showZero) return null;
    return h("span", {
      className: "msds-notif-badge" + (dot ? " msds-notif-badge-dot" : ""),
      "aria-label": props.label || (dot ? "Notificação" : count + " notificações")
    }, display);
  }

  var QUALITY_LABEL = { MEDIDO: "Medido", IMPORTADO: "Importado", ESTIMADO: "Estimado", AUSENTE: "Ausente" };

  function DataQualityBadge(props) {
    var state = props.state || "AUSENTE";
    var showLabel = props.showLabel !== false;
    return h("span", { className: "msds-quality msds-quality-" + state.toLowerCase() },
      h("span", { className: "msds-quality-glyph", "aria-hidden": "true" }),
      h("span", { className: showLabel ? undefined : "msds-sr-only" }, QUALITY_LABEL[state] || state)
    );
  }

export { Badge, DataQualityBadge, NotificationBadge, QUALITY_LABEL };
